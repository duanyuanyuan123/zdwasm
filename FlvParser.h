#ifndef FLVPLAYER_FLVPARSER_H_
#define FLVPLAYER_FLVPARSER_H_

#include <stdint.h>

#include "audio_tag.h"
#include "video_tage.h"
#include "flv_script.h"

typedef void (*StreamParamCallback)(int32_t have_video, int32_t have_audio);

class FLVParser
{
public:
	FLVParser();
	~FLVParser();
	int32_t Init(AudioParamCallback audio_param_callback, AudioCallback audio_callback,
				 VideoParamCallback video_param_callback, VideoCallback video_callback, StreamParamCallback stream_param_callback,
				 VideoDemuxeCallback videoDemuxeCallback, int use_ffmpeg);
	int32_t Parse(uint8_t *pBuf, int nBufSize);

	void DecodeVideo(unsigned char *buff, int size, uint32_t nTimeStamp);

	// void DecodeAudio(unsigned char *buff, int size, uint32_t nTimeStamp);

	void SetAudioSpeed(float speed);

public:
	typedef struct FlvHeader_s
	{
		char Signature[3];
		int nVersion;
		bool bHaveVideo;
		bool bHaveAudio;
		int nHeadSize;
	} FlvHeader;

private:
	bool InitFlvHeader(uint8_t *pBuf);

private:
	bool header_already_;
	FlvHeader header_;

	VideoTag video_tag_;
	AudioTag audio_tag_;
	flv_parser::FlvScript script_tag_;
	uint8_t remain_buf_[15] = {0};
	int32_t remain_buf_size_ = 0;

	int32_t _duration;
	int32_t _fps;
	int32_t _bps;

	StreamParamCallback stream_param_callback_;
};
#endif
