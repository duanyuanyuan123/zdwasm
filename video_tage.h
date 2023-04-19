#ifndef FLVPLAYER_VIDEOTAG_H_
#define FLVPLAYER_VIDEOTAG_H_

#include "tag.h"
#include "h264_decoder.h"
#include <deque>
#include <chrono>

typedef void (*VideoDemuxeCallback)(uint8_t *buff, int size, double timestamp, int type, double org_datasize, int profile_idc, int level_idc, int bps);

class VideoTag : public Tag
{
public:
	VideoTag();
	virtual ~VideoTag();

	int _nFrameType;
	int _nCodecID;
	// H.264
	int _nNalUnitLength;

	virtual void Parse();

	void Decode(unsigned char *buff, int size, uint32_t nTimeStamp);

	void SetVideoCallback(VideoCallback video_callback, VideoDemuxeCallback videoDemuxeCallback, VideoParamCallback video_param_callback, bool use_ffmpeg);
	void SetVideoParam(int32_t duration, int32_t fps, int32_t bps, int32_t width, int32_t height);
	int ParseH264Tag();
	int ParseH264Configuration(uint8_t *pTagData);
	int ParseNalu(uint8_t *pTagData);

	H264Decoder _h264_decoder;

	VideoDemuxeCallback demux_callback_;

	std::deque<double> fps_average_ms_deques;
	bool _skip_decode_p_frame = false;
	int32_t _bps;
	int32_t _profile_idc;
	int32_t _level_idc;

};
#endif
