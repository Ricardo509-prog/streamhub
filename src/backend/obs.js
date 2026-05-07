const OBSWebSocket = require('obs-websocket-js').default;

/**
 * OBS WebSocket Integration
 * Controls OBS remotely: scenes, audio, sources, recording
 * 
 * Setup in OBS: Tools → WebSocket Server Settings → Enable
 * Default port: 4455
 */
class OBSController {
  constructor(io) {
    this.io = io;
    this.obs = new OBSWebSocket();
    this.connected = false;
    this.scenes = [];
    this.currentScene = null;
    this.streaming = false;
    this.recording = false;
    this.sources = [];

    this._setupEventListeners();
  }

  _setupEventListeners() {
    // Scene changed
    this.obs.on('CurrentProgramSceneChanged', (data) => {
      this.currentScene = data.sceneName;
      this.io.emit('obs:scene-changed', { scene: data.sceneName });
      console.log(`[OBS] Scene changed to: ${data.sceneName}`);
    });

    // Stream status
    this.obs.on('StreamStateChanged', (data) => {
      this.streaming = data.outputActive;
      this.io.emit('obs:stream-state', { streaming: data.outputActive, state: data.outputState });
    });

    // Recording status
    this.obs.on('RecordStateChanged', (data) => {
      this.recording = data.outputActive;
      this.io.emit('obs:record-state', { recording: data.outputActive, state: data.outputState });
    });

    // Source mute state
    this.obs.on('InputMuteStateChanged', (data) => {
      this.io.emit('obs:mute-changed', {
        source: data.inputName,
        muted: data.inputMuted
      });
    });

    // Disconnected
    this.obs.on('ConnectionClosed', () => {
      this.connected = false;
      this.io.emit('obs:disconnected');
      console.log('[OBS] Disconnected');
    });
  }

  async connect() {
    const url = process.env.OBS_WEBSOCKET_URL || 'ws://localhost:4455';
    const password = process.env.OBS_WEBSOCKET_PASSWORD || '';

    try {
      await this.obs.connect(url, password);
      this.connected = true;

      // Fetch initial state
      await this._fetchInitialState();

      console.log('[OBS] Connected successfully');
      this.io.emit('obs:connected', {
        scenes: this.scenes,
        currentScene: this.currentScene,
        streaming: this.streaming,
        recording: this.recording,
        sources: this.sources
      });
    } catch (err) {
      throw new Error(`OBS connection failed: ${err.message}. Make sure OBS is open and WebSocket is enabled.`);
    }
  }

  async _fetchInitialState() {
    // Get scenes
    const scenesResponse = await this.obs.call('GetSceneList');
    this.scenes = scenesResponse.scenes.map(s => s.sceneName).reverse();
    this.currentScene = scenesResponse.currentProgramSceneName;

    // Get streaming/recording status
    const streamStatus = await this.obs.call('GetStreamStatus');
    this.streaming = streamStatus.outputActive;

    const recordStatus = await this.obs.call('GetRecordStatus');
    this.recording = recordStatus.outputActive;

    // Get audio sources
    const inputsResponse = await this.obs.call('GetInputList');
    this.sources = inputsResponse.inputs.map(i => ({
      name: i.inputName,
      kind: i.inputKind
    }));
  }

  // ---- Scene Control ----

  async switchScene(sceneName) {
    if (!this.connected) throw new Error('OBS not connected');
    await this.obs.call('SetCurrentProgramScene', { sceneName });
    console.log(`[OBS] Switched to scene: ${sceneName}`);
  }

  async getScenes() {
    if (!this.connected) throw new Error('OBS not connected');
    const response = await this.obs.call('GetSceneList');
    this.scenes = response.scenes.map(s => s.sceneName).reverse();
    this.currentScene = response.currentProgramSceneName;
    return { scenes: this.scenes, currentScene: this.currentScene };
  }

  // ---- Audio Control ----

  async muteSource(sourceName, muted) {
    if (!this.connected) throw new Error('OBS not connected');
    await this.obs.call('SetInputMute', { inputName: sourceName, inputMuted: muted });
    console.log(`[OBS] ${muted ? 'Muted' : 'Unmuted'} source: ${sourceName}`);
  }

  async toggleMute(sourceName) {
    if (!this.connected) throw new Error('OBS not connected');
    await this.obs.call('ToggleInputMute', { inputName: sourceName });
  }

  async setVolume(sourceName, volumeDb) {
    if (!this.connected) throw new Error('OBS not connected');
    // Volume in dB (-100 to 0, where 0 is 100%)
    await this.obs.call('SetInputVolume', {
      inputName: sourceName,
      inputVolumeDb: Math.max(-100, Math.min(0, volumeDb))
    });
  }

  async getAudioSources() {
    if (!this.connected) throw new Error('OBS not connected');
    const response = await this.obs.call('GetInputList');
    const audioKinds = ['wasapi_input_capture', 'wasapi_output_capture', 'pulse_input_capture', 'pulse_output_capture', 'coreaudio_input_capture', 'coreaudio_output_capture'];
    return response.inputs.filter(i => audioKinds.some(k => i.inputKind.includes(k)));
  }

  // ---- Source Visibility ----

  async setSourceVisible(sceneName, sourceName, visible) {
    if (!this.connected) throw new Error('OBS not connected');

    // Find the source in the scene
    const sceneItems = await this.obs.call('GetSceneItemList', { sceneName });
    const item = sceneItems.sceneItems.find(i => i.sourceName === sourceName);

    if (!item) throw new Error(`Source "${sourceName}" not found in scene "${sceneName}"`);

    await this.obs.call('SetSceneItemEnabled', {
      sceneName,
      sceneItemId: item.sceneItemId,
      sceneItemEnabled: visible
    });

    console.log(`[OBS] Source "${sourceName}" ${visible ? 'shown' : 'hidden'}`);
  }

  async getSceneSources(sceneName) {
    if (!this.connected) throw new Error('OBS not connected');
    const response = await this.obs.call('GetSceneItemList', {
      sceneName: sceneName || this.currentScene
    });
    return response.sceneItems.map(item => ({
      id: item.sceneItemId,
      name: item.sourceName,
      visible: item.sceneItemEnabled,
      kind: item.inputKind
    }));
  }

  // ---- Recording Control ----

  async startRecording() {
    if (!this.connected) throw new Error('OBS not connected');
    if (this.recording) throw new Error('Already recording');
    await this.obs.call('StartRecord');
    console.log('[OBS] Recording started');
  }

  async stopRecording() {
    if (!this.connected) throw new Error('OBS not connected');
    if (!this.recording) throw new Error('Not recording');
    await this.obs.call('StopRecord');
    console.log('[OBS] Recording stopped');
  }

  async toggleRecording() {
    if (!this.connected) throw new Error('OBS not connected');
    await this.obs.call('ToggleRecord');
  }

  // ---- Stream Control ----

  async startStreaming() {
    if (!this.connected) throw new Error('OBS not connected');
    await this.obs.call('StartStream');
  }

  async stopStreaming() {
    if (!this.connected) throw new Error('OBS not connected');
    await this.obs.call('StopStream');
  }

  // ---- Status ----

  getStatus() {
    return {
      connected: this.connected,
      streaming: this.streaming,
      recording: this.recording,
      currentScene: this.currentScene,
      scenes: this.scenes
    };
  }

  disconnect() {
    if (this.connected) {
      this.obs.disconnect();
      this.connected = false;
    }
  }
}

module.exports = OBSController;
