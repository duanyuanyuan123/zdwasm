function PCMPlayer(option, onAudioFramePlaybackEnd, player) {
    this.init(option, onAudioFramePlaybackEnd, player);
}

PCMPlayer.prototype.init = function (option, onAudioFramePlaybackEnd, player) {
    var defaults = {
        encoding: '16bitInt',
        channels: 1,
        sampleRate: 8000,
        flushingTime: 1000
    };
    this.player = player;
    this.ratio = 1.0;
    this.onAudioFramePlaybackEnd = onAudioFramePlaybackEnd;
    this.option = Object.assign({}, defaults, option);
    this.samples = new Float32Array();
    // this.flush = this.flush.bind(this);
    // this.interval = setInterval(this.flush, this.option.flushingTime);
    this.maxValue = this.getMaxValue();
    this.typedArray = this.getTypedArray();
    this.timestampBuffer = [];
    this.createContext();

};

PCMPlayer.prototype.getMaxValue = function () {
    var encodings = {
        '8bitInt': 128,
        '16bitInt': 32768,
        '32bitInt': 2147483648,
        '32bitFloat': 1
    }

    return encodings[this.option.encoding] ? encodings[this.option.encoding] : encodings['16bitInt'];
};

PCMPlayer.prototype.getTypedArray = function () {
    var typedArrays = {
        '8bitInt': Int8Array,
        '16bitInt': Int16Array,
        '32bitInt': Int32Array,
        '32bitFloat': Float32Array
    }

    return typedArrays[this.option.encoding] ? typedArrays[this.option.encoding] : typedArrays['16bitInt'];
};

PCMPlayer.prototype.createContext = function () {
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.value = this.ratio;
    this.gainNode.connect(this.audioCtx.destination);
    this.startTime = this.audioCtx.currentTime;
};

PCMPlayer.prototype.isTypedArray = function (data) {
    return (data.byteLength && data.buffer && data.buffer.constructor == ArrayBuffer);
};

PCMPlayer.prototype.feed = function (data, timestamp, playbackRate) {
    if (!this.isTypedArray(data)) return;
    data = this.getFormatedValue(data);
    var tmp = new Float32Array(this.samples.length + data.length);
    tmp.set(this.samples, 0);
    tmp.set(data, this.samples.length);
    this.samples = tmp;
    this.playbackRate = 1.0;
    this.timestampBuffer.push(timestamp);
};

PCMPlayer.prototype.getFormatedValue = function (data) {
    var data = new this.typedArray(data.buffer),
        float32 = new Float32Array(data.length),
        i;

    for (i = 0; i < data.length; i++) {
        float32[i] = data[i] / this.maxValue;
    }
    return float32;
};

PCMPlayer.prototype.setVolume = function (volume) {
    this.gainNode.gain.value = volume * this.ratio;
};

PCMPlayer.prototype.getVolume = function () {
    return this.gainNode.gain.value / this.ratio;
};

PCMPlayer.prototype.destroy = function () {
    if (this.interval) {
        clearInterval(this.interval);
    }
    this.samples = null;
    this.audioCtx.close();
    this.audioCtx = null;
};

PCMPlayer.prototype.flush = function () {
    if (!this.samples.length) return;
    var bufferSource = this.audioCtx.createBufferSource(),
        length = this.samples.length / this.option.channels,
        audioBuffer = this.audioCtx.createBuffer(this.option.channels, length, this.option.sampleRate),
        audioData,
        channel,
        offset,
        i,
        decrement;

    for (channel = 0; channel < this.option.channels; channel++) {
        audioData = audioBuffer.getChannelData(channel);
        offset = channel;
        decrement = 50;
        for (i = 0; i < length; i++) {
            audioData[i] = this.samples[offset];
            /* fadein */
            if (i < 50) {
                audioData[i] = (audioData[i] * i) / 50;
            }
            /* fadeout*/
            if (i >= (length - 51)) {
                audioData[i] = (audioData[i] * decrement--) / 50;
            }
            offset += this.option.channels;
        }
    }

    if (this.startTime < this.audioCtx.currentTime) {
        this.startTime = this.audioCtx.currentTime;
    }
    //console.log('start vs current '+this.startTime+' vs '+this.audioCtx.currentTime+' duration: '+audioBuffer.duration);
    if (this.timestampBuffer.length > 0) {
        bufferSource.timestamp = this.timestampBuffer[0];
        this.timestampBuffer.shift();
    }
    bufferSource.playbackRate.value = this.playbackRate;
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(this.gainNode);
    bufferSource.start(this.startTime);
    var that = this;
    bufferSource.onended = function (info) {
        that.onAudioFramePlaybackEnd(info, that.player);
        that.bufferSources.shift();
    }
    this.startTime += audioBuffer.duration;
    this.samples = new Float32Array();
};

PCMPlayer.prototype.getTimestamp = function () {
    if (this.audioCtx) {
        return this.audioCtx.currentTime;
    } else {
        return 0;
    }
};

PCMPlayer.prototype.play = function (data, timestamp, onend, player) {

    // data = this.getFormatedValue(data);
    if (!data.length) {
        return;
    }
    // var lSourceData = new this.typedArray(ldata.buffer);
    var sourceData = new this.typedArray(data.buffer);
    let bufferSource = this.audioCtx.createBufferSource(),
        channels = this.option.channels;
    let length = sourceData.length / channels,
        audioBuffer = this.audioCtx.createBuffer(channels, length, this.option.sampleRate),
        audioData,
        channel;
    // offset,
    // i;

    for (channel = 0; channel < channels; channel++) {
        audioData = audioBuffer.getChannelData(channel);
        // offset = channel;
        let channelData = sourceData.slice(channel * length, length + channel * length);
        audioData.set(channelData);
    }

    if (this.startTime < this.audioCtx.currentTime) {
        this.startTime = this.audioCtx.currentTime;
    }

    // console.log('start vs current '+this.startTime+' vs '+this.audioCtx.currentTime+' duration: '+audioBuffer.duration);
    bufferSource.timestamp = timestamp;
    bufferSource.buffer = audioBuffer;
    // bufferSource.msg = "测试TAG";
    bufferSource.connect(this.gainNode);
    bufferSource.onended = function (info) {
        onend(info, player);
    }
    bufferSource.start(this.startTime);
    this.startTime += (audioBuffer.duration);
};

PCMPlayer.prototype.pause = function () {
    if (this.audioCtx.state === 'running') {
        this.audioCtx.suspend()
    }
    var u = navigator.userAgent;
    var isiOS = !!u.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/); //ios终端
    if (!isiOS) {
        this.audioCtx.close();
    }
}

PCMPlayer.prototype.resume = function () {
    // console.log("PCMPlayer.prototype.resume-> this.audioCtx.state: ", this.audioCtx.state);
    // if(this.audioCtx)
    // {
    //     this.audioCtx.suspend();
    //     this.audioCtx.close();
    // }
    if (this.audioCtx.state === 'closed') {
        this.createContext();
    }
    if (this.audioCtx.state === 'suspended') {
        console.log("PCMPlayer.prototype.resume-> this.audioCtx.state: ", this.audioCtx.state);
        this.audioCtx.resume();
    }
}

PCMPlayer.prototype.status = function () {
    // console.log("this.audioCtx.state -> ", this.audioCtx.state);
    if (this.audioCtx) {
        return this.audioCtx.state;
    } else {
        return "suspended";
    }
}

