// audio-manager.js
export class AudioManager {
    constructor() {
        this.audioCtx = null;
        this.analyser = null;
        this.source = null;
        this.stream = null; // Keep track of stream to stop it later
        this.dataArray = null;

        this.isLive = false;
        this.isTestMode = true;
        this.rafId = null;

        this.bassRange = [0, 10];
        this.midRange = [11, 100];
        this.highRange = [101, 500];
    }

    setTestMode(enabled) {
        this.isTestMode = enabled;
        // Suspend context when testing to save CPU, resume when live
        if (this.audioCtx) {
            if (enabled && this.audioCtx.state === 'running') this.audioCtx.suspend();
            else if (!enabled && this.audioCtx.state === 'suspended') this.audioCtx.resume();
        }
    }

    /**
     * Returns a list of available audio input devices.
     * Note: Labels are empty strings until permission is granted.
     */
    async getAudioDevices() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(d => d.kind === 'audioinput');
    }

    /**
     * Starts audio input.
     * @param {string|null} deviceId - Optional specific device ID
     */
    async enableLiveInput(deviceId = null) {
        try {
            // 1. Setup Audio Context if missing
            if (!this.audioCtx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioCtx = new AudioContext();
                this.analyser = this.audioCtx.createAnalyser();
                this.analyser.fftSize = 2048;
                this.analyser.smoothingTimeConstant = 0.8;

                const bufferLength = this.analyser.frequencyBinCount;
                this.dataArray = new Uint8Array(bufferLength);
            }

            // 2. Stop existing stream if switching devices
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
            if (this.source) {
                this.source.disconnect();
            }

            // 3. Constraints
            const constraints = {
                audio: deviceId ? { deviceId: { exact: deviceId } } : true
            };

            // 4. Get Stream
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            // 5. Connect Source -> Analyser
            this.source = this.audioCtx.createMediaStreamSource(this.stream);
            this.source.connect(this.analyser);

            this.isLive = true;
            this.isTestMode = false;

            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

            console.log(`[AudioManager] Connected to device: ${deviceId || 'Default'}`);
            return true;

        } catch (err) {
            console.error('[AudioManager] Access denied or error:', err);
            alert('Could not access microphone. Check permissions.');
            return false;
        }
    }

    getAverageVolume(array, start, end) {
        let values = 0;
        let count = 0;
        for (let i = start; i < end; i++) {
            if (array[i] !== undefined) {
                values += array[i];
                count++;
            }
        }
        return count === 0 ? 0 : values / count;
    }

    startLoop() {
        const loop = () => {
            this.rafId = requestAnimationFrame(loop);

            let low = 0, mid = 0, high = 0;

            if (this.isTestMode || !this.isLive) {
                low = Math.random() * 100;
                mid = Math.random() * 100;
                high = Math.random() * 100;
            } else {
                this.analyser.getByteFrequencyData(this.dataArray);
                const bassAvg = this.getAverageVolume(this.dataArray, this.bassRange[0], this.bassRange[1]);
                const midAvg = this.getAverageVolume(this.dataArray, this.midRange[0], this.midRange[1]);
                const highAvg = this.getAverageVolume(this.dataArray, this.highRange[0], this.highRange[1]);

                low = (bassAvg / 255) * 100;
                mid = (midAvg / 255) * 100;
                high = (highAvg / 255) * 100 * 1.2;
            }

            // Clamp
            low = Math.min(100, Math.max(0, low));
            mid = Math.min(100, Math.max(0, mid));
            high = Math.min(100, Math.max(0, high));

            if (window.currentAnimation && typeof window.currentAnimation.updateFrequencies === 'function') {
                window.currentAnimation.updateFrequencies(Math.floor(low), Math.floor(mid), Math.floor(high));
            }
        };
        loop();
    }
}