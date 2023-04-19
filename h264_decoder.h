#ifndef FLV_PARSE_H264_DECODER_H_
#define FLV_PARSE_H264_DECODER_H_

#ifdef __cplusplus
extern "C"
{
#define __STDC_CONSTANT_MACROS
#include "libavutil/imgutils.h"
#include "libavformat/avformat.h"
}

#endif

#include "wels/codec_api.h"
#include "common.h"
#include "Timer.hpp"
#include <fstream>
#include <mutex>

typedef void (*VideoCallback)(uint8_t *ybuff, int ysize, uint8_t *ubuff, int usize, uint8_t *vbuff, int vsize, double timestamp, double time_consuming, int32_t init_stamp, int32_t datasize);
typedef void (*VideoParamCallback)(int32_t duration, int32_t fps, int32_t bps, int32_t fmt, int32_t width, int32_t height);

class H264Decoder
{
public:
	H264Decoder();
	~H264Decoder();
	int Init();
	void Uninit();
	bool initialized() { return _initialized; }
	ErrorCode Decode(uint8_t *data, int32_t len, uint32_t ts);

	void SetVideoCallback(VideoCallback video_callback, VideoParamCallback video_param_callback, bool use_ffmpeg);
	void SetVideoParam(int32_t duration, int32_t fps, int32_t bps, int32_t width, int32_t height);

protected:
	int32_t Release();
	ErrorCode ProcessDecodedVideoFrame(AVFrame *frame, uint32_t ts, int32_t size);
	ErrorCode DecodePacket(AVPacket *pkt, uint32_t ts);
	ErrorCode CopyYuvData(AVFrame *frame, unsigned char *buffer, int width, int height);

private:
	bool _initialized;
	bool _av_register;
	std::unique_ptr<AVCodecContext, AVCodecContextDeleter> _av_codec_context;
	std::unique_ptr<AVFrame, AVFrameDeleter> _av_frame;
	AVPacket *_av_pkt = nullptr;

	int32_t _pix_fmt;
	int32_t _width;
	int32_t _height;
	int32_t _duration;
	int32_t _fps;
	int32_t _bps;

	ISVCDecoder *_pSvcDecoder;
	SBufferInfo _sDstBufInfo;
	SDecodingParam _sDecParam = {0};

	// uint8_t *_y_buffer;
	int32_t _y_size;
	// uint8_t *_u_buffer;
	// uint8_t *_v_buffer;
	int32_t _uv_size;
	int32_t _cur_video_size;

	// std::mutex _mutex_video_callback;
	VideoParamCallback _video_param_callback;
	VideoCallback _video_callback;
	Timer _timer;
	int32_t _time_last_init;

	bool _use_ffmpeg;
#ifdef RAM_DUMP
	std::fstream _debug_dump_f;
#endif // RAM_DUMP
};
#endif
