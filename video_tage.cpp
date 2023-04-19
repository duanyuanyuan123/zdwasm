#include "video_tage.h"

#include <string.h>
#include <iostream>

static const unsigned int nH264StartCode = 0x01000000;
static const uint32_t packet_avg_count = 250;

VideoTag::VideoTag()
{
	std::cout << "VideoTag::VideoTag" << std::endl;
	_pTagData = NULL;
	_pMedia = NULL;
	_nMediaLen = 0;
	_nNeedDataLen = 0;
	_nMediaSize = 0;
	_bps = 0;
	std::cout << "_h264_parse construct。。。。。。。。。" << std::endl;
}

VideoTag::~VideoTag()
{
	_h264_decoder.Uninit();
	if (_pMedia != nullptr)
	{
		delete _pMedia;
		_pMedia = nullptr;
	}
	std::cout << "VideoTag::~VideoTag" << std::endl;
}

void VideoTag::SetVideoCallback(VideoCallback video_callback, VideoDemuxeCallback videoDemuxeCallback, VideoParamCallback video_param_callback, bool use_ffmpeg)
{
	_h264_decoder.SetVideoCallback(video_callback, video_param_callback, use_ffmpeg);
	demux_callback_ = videoDemuxeCallback;
}

void VideoTag::SetVideoParam(int32_t duration, int32_t fps, int32_t bps, int32_t width, int32_t height)
{
	_h264_decoder.SetVideoParam(duration, fps, bps, width, height);
	_bps = bps;
}

void VideoTag::Decode(unsigned char *buff, int size, uint32_t nTimeStamp)
{
	if (!_h264_decoder.initialized())
	{
		_h264_decoder.Init();
	}

	_h264_decoder.Decode(buff, size, nTimeStamp);
}

void VideoTag::Parse()
{
	_nCodecID = _pTagData[0] & 0x0f;
	if (_header.nType == 0x09 && _nCodecID == 7)
	{
		int32_t nal_unit_type = ParseH264Tag();

		if (demux_callback_ != nullptr)
		{
			// HEVCParser::stHDRMetadata _info;
			// _h264_parse.h264_parser(_pMedia, _nMediaLen, _info);

			demux_callback_(_pMedia, _nMediaLen, _header.nTotalTS, nal_unit_type, u64DateSize, _profile_idc, _level_idc, _bps);
		}
		else
		{
			if (!_h264_decoder.initialized())
			{
				_h264_decoder.Init();
			}
			_h264_decoder.Decode(_pMedia, _nMediaLen, _header.nTotalTS);
		}
	}
}

int VideoTag::ParseH264Tag()
{
	int nAVCPacketType = _pTagData[1];

	if (nAVCPacketType == 1)
	{
		return ParseNalu(_pTagData);
	}
	else if (nAVCPacketType == 0)
	{
		return ParseH264Configuration(_pTagData);
	}
	return 5;
}

int VideoTag::ParseH264Configuration(uint8_t *pTagData)
{
	unsigned char *pd = pTagData;

	_nNalUnitLength = (pd[9] & 0x03) + 1;

	int32_t nal_unit_type = 0;
	int sps_size, pps_size;
	sps_size = Tag::ShowU16(pd + 11);
	pps_size = Tag::ShowU16(pd + 11 + (2 + sps_size) + 1);

	int32_t nMediaLen = _nMediaLen;
	_nMediaLen = 4 + sps_size + 4 + pps_size;
	if (_pMedia == nullptr || _nMediaLen > nMediaLen)
	{
		delete _pMedia;
		_pMedia = new uint8_t[_nMediaLen];
	}

	memcpy(_pMedia, &nH264StartCode, 4);
	memcpy(_pMedia + 4, pd + 11 + 2, sps_size);
	nal_unit_type = (*(pd + 11 + 2)) & 0x1f;
	if (nal_unit_type == 7)
	{
		uint32_t StartBit = 8;
		_profile_idc = *(pd + 11 + 2 + 1);
		_level_idc = *(pd + 11 + 2 + 3);
	}
	memcpy(_pMedia + 4 + sps_size, &nH264StartCode, 4);
	memcpy(_pMedia + 4 + sps_size + 4, pd + 11 + 2 + sps_size + 2 + 1, pps_size);
	nal_unit_type = (*(pd + 11 + 2 + sps_size + 2 + 1)) & 0x1f;

	return nal_unit_type;
}

int VideoTag::ParseNalu(uint8_t *pTagData)
{
	unsigned char *pd = pTagData;
	int nOffset = 0;

	if (_pMedia == nullptr || _header.nDataSize + 10 > _nMediaSize)
	{
		delete _pMedia;
		_nMediaSize = _header.nDataSize + 10;
		_pMedia = new uint8_t[_nMediaSize];
	}

	_nMediaLen = 0;
	int32_t nal_unit_type = 0;
	nOffset = 5;
	while (1)
	{
		if (nOffset >= _header.nDataSize)
			break;

		int nNaluLen;
		switch (_nNalUnitLength)
		{
		case 4:
			nNaluLen = Tag::ShowU32(pd + nOffset);
			break;
		case 3:
			nNaluLen = Tag::ShowU24(pd + nOffset);
			break;
		case 2:
			nNaluLen = Tag::ShowU16(pd + nOffset);
			break;
		default:
			nNaluLen = Tag::ShowU8(pd + nOffset);
		}
		nal_unit_type = (*(pd + nOffset + _nNalUnitLength)) & 0x1f;
		memcpy(_pMedia + _nMediaLen, &nH264StartCode, 4);
		memcpy(_pMedia + _nMediaLen + 4, pd + nOffset + _nNalUnitLength, nNaluLen);
		_nMediaLen += (4 + nNaluLen);
		nOffset += (_nNalUnitLength + nNaluLen);
	}

	return nal_unit_type;
}
