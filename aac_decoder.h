#ifndef FLV_PARSE_AAC_DECODER_H_
#define FLV_PARSE_AAC_DECODER_H_

#ifdef __cplusplus
extern "C"
{
#include "libavformat/avformat.h"
}
#endif

#include "common.h"
#include "sonic.h"

#include <fstream>
#include <chrono>
#include <mutex>

typedef void (*AudioCallback)(uint8_t *buff, int32_t size, double timestamp, double datasize);
typedef void (*AudioParamCallback)(int32_t sample_fmt, int32_t channels, int32_t sample_rate);

class AACDecoder
{
public:
	AACDecoder();
	int Init();
	void Uninit();
	bool initialized() { return _initialized; }
	ErrorCode Decode(uint8_t *data, int32_t len, uint32_t ts);

	void SetAudioCallback(AudioParamCallback audio_param_callback, AudioCallback audio_callback);

	void SetSpeed(float speed);

protected:
	ErrorCode ProcessDecodedAudioFrame(AVFrame *frame, uint32_t ts);
	int RoundUp(int numToRound, int multiple);
	ErrorCode DecodePacket(AVPacket *pkt, int *decodedLen, uint32_t ts);

	void InitSonic();

	void Float2Int16Data(int32_t channels, int32_t samples);
	const float* Int162FloatData(int32_t samples, int32_t channel);

private:
	std::unique_ptr<AVCodecContext, AVCodecContextDeleter> _av_codec_context;
	std::unique_ptr<AVFrame, AVFrameDeleter> _av_frame;

	AVCodecParameters *_av_codec_paramters;
	AVPacket *_av_pkt = nullptr;
	uint8_t *_pcm_buffer;
	int16_t *_pcm_int16_buffer;
	float *_pcm_float_buffer;
	int32_t _cur_pcm_buffer_size;

	int32_t _sample_fmt;
	int32_t _channels;
	int32_t _sample_rate;
	int32_t _out_sample_fmt;

	bool _initialized;

	// std::mutex _mutex_callback;
	AudioCallback _audio_callback;
	AudioParamCallback _audio_param_callback;
	sonicStream _stream;
	float _speed;
#ifdef RAM_DUMP
	std::fstream _debug_dump_f;
#endif // RAM_DUMP
};
#endif
