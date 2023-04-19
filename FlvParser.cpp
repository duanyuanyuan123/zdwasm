#include "FlvParser.h"

#include <string.h>
#include <iostream>

FLVParser::FLVParser()
	: header_already_(false),
	  stream_param_callback_(nullptr),
	  _duration(-1),
	  _fps(25),
	  _bps(0)
{
	remain_buf_size_ = 0;
	u64DateSize = 0;
}

FLVParser::~FLVParser()
{
	std::cout << "FLVParser::~FLVParser" << std::endl;
}

int32_t FLVParser::Init(AudioParamCallback audio_param_callback, AudioCallback audio_callback,
						VideoParamCallback video_param_callback, VideoCallback video_callback, StreamParamCallback stream_param_callback,
						VideoDemuxeCallback videoDemuxeCallback, int use_ffmpeg)
{
	audio_tag_.SetAudioCallback(audio_param_callback, audio_callback);
	video_tag_.SetVideoCallback(video_callback, videoDemuxeCallback, video_param_callback, (use_ffmpeg == 1));

	stream_param_callback_ = stream_param_callback;
	return 0;
}

void FLVParser::SetAudioSpeed(float speed)
{
	audio_tag_.SetSpeed(speed);
}

int32_t FLVParser::Parse(uint8_t *pBuf, int nBufSize)
{
	u64DateSize += nBufSize;
	// simpleLog("FLVParser::Parse pBuf size: %d", nBufSize);
	// std::cout << "total data size: " << nBufSize << std::endl;
	int32_t offset = 0;
	int32_t remain = nBufSize;

	if (!header_already_)
	{
		if (nBufSize < 9)
		{
			memcpy(remain_buf_ + remain_buf_size_, pBuf + offset, remain);
			remain_buf_size_ += remain;
			return 0;
		}

		if (remain_buf_size_ > 0)
		{
			memcpy(remain_buf_ + remain_buf_size_, pBuf + offset, 9 - remain_buf_size_);
			offset += (9 - remain_buf_size_);
			remain -= (9 - remain_buf_size_);

			InitFlvHeader(remain_buf_);
			offset += header_.nHeadSize;
			remain -= header_.nHeadSize;
			remain_buf_size_ = 0;
		}
		else
		{
			InitFlvHeader(pBuf + offset);
			offset += header_.nHeadSize;
			remain -= header_.nHeadSize;
		}

		stream_param_callback_((header_.bHaveVideo ? 1 : 0), (header_.bHaveAudio ? 1 : 0));

		// std::cout << "stream type: " << header_.Signature << std::endl;
	}
	while (remain > 0)
	{
		if (audio_tag_._nNeedDataLen > 0)
		{
			// int32_t nNeedDataLen = audio_tag_._nNeedDataLen;
			int32_t len = audio_tag_.Append(pBuf + offset, remain);
			offset += len;
			remain -= len;
			// std::cout << __LINE__ << " line, Audio Tage, Data size : " << audio_tag_._header.nDataSize
			// 		  << ", real data : " << len << ", need data size :" << nNeedDataLen << ", remain data: " << remain << std::endl;
			if (audio_tag_._nNeedDataLen == 0)
			{
				audio_tag_.Parse();
			}
		}

		if (video_tag_._nNeedDataLen > 0)
		{
			int32_t len = video_tag_.Append(pBuf + offset, remain);
			offset += len;
			remain -= len;
			// std::cout << __LINE__ << " line, Video Tage, Data size : " << video_tag_._header.nDataSize
			// 		  << ", real data : " << len << ", need data size :" << nNeedDataLen << ", remain data: " << remain << ", offset: " << offset << std::endl;
			if (video_tag_._nNeedDataLen == 0)
			{
				video_tag_.Parse();
			}
		}

		if (script_tag_._nNeedDataLen > 0)
		{
			// std::cout << __LINE__ << " line, Video Tage, completed to parse "<< std::endl;
			// int32_t nNeedDataLen = other_tag_._nNeedDataLen;
			int32_t len = script_tag_.Append(pBuf + offset, remain);
			offset += len;
			remain -= len;
			if (script_tag_._nNeedDataLen == 0)
			{
				script_tag_.ParseData();
				_duration = script_tag_.Duration();
				_fps = script_tag_.fps();
				_bps = script_tag_.VideoRate();
				video_tag_.SetVideoParam(_duration, _fps, _bps, script_tag_.Width(), script_tag_.Height());
			}
			// std::cout << __LINE__ << " line, Script Tage, Data size : " << other_tag_._header.nDataSize
			// 		  << ", real data : " << len << ", need data size :" << nNeedDataLen << ", remain data: " << remain << std::endl;
		}

		if (remain_buf_size_ > 0)
		{
			if (remain < (15 - remain_buf_size_))
			{
				// std::cout << __LINE__ << " line, remain_buf_size_ : " << remain_buf_size_ << ", offset : " << offset << ", remain : " << remain << std::endl;
				memcpy(remain_buf_ + remain_buf_size_, pBuf + offset, remain);
				remain_buf_size_ += remain;
				// offset += remain;
				// remain -= remain;
				break;
			}
			else
			{
				memcpy(remain_buf_ + remain_buf_size_, pBuf + offset, 15 - remain_buf_size_);

				offset += (15 - remain_buf_size_);
				remain -= (15 - remain_buf_size_);
				// std::cout << __LINE__ << " line, remain_buf_size_ : " << remain_buf_size_ << ", offset : " << offset << ", remain : " << remain << std::endl;
				remain_buf_size_ = 0;
				// int type = Tag::ShowU8(remain_buf_ + 4);
				// std::cout << __LINE__ << " line, type : " << type << ", offset : " << offset << ", remain : " << remain << std::endl;
				switch (Tag::ShowU8(remain_buf_ + 4))
				{
				case 0x08:
				{
					int32_t realdata = audio_tag_.Init(remain_buf_ + 4, 15 - 4);
					// std::cout << "line: " << __LINE__ << ", Audio Tage, Data size : " << audio_tag_._header.nDataSize << ", real data : "
					// 		  << realdata << ", need data size: " << audio_tag_._nNeedDataLen << ", remain data: " << remain << std::endl;
					// audio_tag_.Parse();
					// offset += (audio_tag_._header.nDataSize);
					// remain -= (audio_tag_._header.nDataSize);
					break;
				}
				case 0x09:
				{
					int32_t realdata = video_tag_.Init(remain_buf_ + 4, 15 - 4);
					// std::cout << __LINE__ << " line, Video Tage, Data size : " << video_tag_._header.nDataSize
					// 		  << ", real data : " << realdata << ", need data size :" << video_tag_._nNeedDataLen << ", remain data: " << remain << ", offset: " << offset << std::endl;
					// video_tag_.Parse();
					// offset += (video_tag_._header.nDataSize);
					// remain -= (video_tag_._header.nDataSize);
					break;
				}
				default:
				{
					script_tag_.Init(remain_buf_ + 4, 15 - 4);

					// std::cout << "line: " << __LINE__ << ", other tag parse....." << std::endl;
					// offset += (other_tag_._header.nDataSize);
					// remain -= (other_tag_._header.nDataSize);
				}
				}

				// std::cout << __LINE__ << " line, remain_buf_size_ : " << remain_buf_size_ << ", offset : " << offset << ", remain : " << remain << std::endl;
			}
		}
		else
		{
			// std::cout << __LINE__ << " line, remain : " << remain << std::endl;

			if (remain >= 0 && remain < 15)
			{
				// std::cout << __LINE__ << " line, left less than " << remain << ", offset : " << offset << std::endl;
				memcpy(remain_buf_, pBuf + offset, remain);
				remain_buf_size_ = remain;
				// offset += remain;
				// remain -= remain;
				break;
			}

			// int nPrevSize = Tag::ShowU32(pBuf + offset);
			offset += 4;
			remain -= 4;

			// int32_t type = Tag::ShowU8(pBuf + offset);

			switch (Tag::ShowU8(pBuf + offset))
			{
			case 0x08:
			{
				int32_t realLen = audio_tag_.Init(pBuf + offset, remain);
				offset += realLen;
				remain -= realLen;
				// std::cout << "line: " << __LINE__ << ", Audio Tage, Data size : " << audio_tag_._header.nDataSize << ", real data : "
				// 		  << realLen << ", need data size: " << audio_tag_._nNeedDataLen << ", remain data: " << remain << std::endl;
				if (audio_tag_._nNeedDataLen == 0)
				{
					audio_tag_.Parse();
				}

				break;
			}
			case 0x09:
			{

				int32_t realLen = video_tag_.Init(pBuf + offset, remain);
				offset += realLen;
				remain -= realLen;
				if (video_tag_._nNeedDataLen == 0)
				{
					video_tag_.Parse();
				}
				break;
			}
			default:
			{
				int32_t realLen = script_tag_.Init(pBuf + offset, remain);
				if (script_tag_._nNeedDataLen == 0)
				{
					script_tag_.ParseData();
					_duration = script_tag_.Duration();
					_fps = script_tag_.fps();
					_bps = script_tag_.VideoRate();
					video_tag_.SetVideoParam(_duration, _fps, _bps, script_tag_.Width(), script_tag_.Height());
					offset += realLen;
					remain -= realLen;
				}
			}
			}

			if (remain >= 0 && remain < 15)
			{
				memcpy(remain_buf_, pBuf + offset, remain);
				remain_buf_size_ = remain;
				// offset += remain;
				// remain -= remain;
				//  std::cout << __LINE__ << "line, parse end" << std::endl;
				break;
			}
		}
	}
	// std::cout << __LINE__ << "line, parse end" << std::endl;
	return 0;
}

void FLVParser::DecodeVideo(unsigned char *buff, int size, uint32_t nTimeStamp)
{
	video_tag_.Decode(buff, size, nTimeStamp);
}

// void FLVParser::DecodeAudio(unsigned char *buff, int size, uint32_t nTimeStamp)
// {
// 	audio_tag_.Decode(buff, size, nTimeStamp);
// }

bool FLVParser::InitFlvHeader(uint8_t *pBuf)
{
	memcpy(header_.Signature, pBuf, 3);
	header_.nVersion = pBuf[3];
	header_.bHaveAudio = pBuf[4] & 0x04;
	header_.bHaveVideo = pBuf[4] & 0x01;
	header_.nHeadSize = Tag::ShowU32(pBuf + 5);

	header_already_ = true;

	return header_already_;
}