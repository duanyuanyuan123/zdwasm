#include "h264_decoder.h"

#include <iostream>

H264Decoder::H264Decoder()
	: /*_y_buffer(nullptr),
	  _u_buffer(nullptr),
	  _v_buffer(nullptr),*/
	  _cur_video_size(0),
	  _y_size(0),
	  _uv_size(0),
	  _initialized(false),
	  _video_callback(nullptr),
	  _duration(0),
	  _pix_fmt(-1),
	  _width(0),
	  _height(0),
	  _fps(25),
	  _bps(0),
	  _pSvcDecoder(nullptr),
	  _use_ffmpeg(true)
{
	std::cout << "useffmpeg init false......." << std::endl;
}

H264Decoder::~H264Decoder()
{
	// if (_y_buffer)
	// {
	// 	delete _y_buffer;
	// }

	// if (_u_buffer)
	// {
	// 	delete _u_buffer;
	// }

	// if (_v_buffer)
	// {
	// 	delete _v_buffer;
	// }
}

void H264Decoder::SetVideoCallback(VideoCallback video_callback, VideoParamCallback video_param_callback, bool use_ffmpeg)
{
	// std::lock_guard<std::mutex> locker(_mutex_video_callback);
	_video_callback = video_callback;
	_video_param_callback = video_param_callback;
	_use_ffmpeg = use_ffmpeg;
	_timer.reset();
	Init();
	_time_last_init = _timer.elapsed();
}

void H264Decoder::SetVideoParam(int32_t duration, int32_t fps, int32_t bps, int32_t width, int32_t height)
{
	_duration = duration;
	_fps = fps;
	_bps = bps;
	_width = width;
	_height = height;

	if (_use_ffmpeg)
	{
		std::cout << "use ffmpeg decode......." << std::endl;
	}
	else
	{
		std::cout << "use Open H264 decode......." << std::endl;
	}
	// if (_video_param_callback)
	// {
	// 	_video_param_callback(_duration, _fps, _bps, _pix_fmt, _width, _height);
	// }
}

int H264Decoder::Init()
{
#ifdef RAM_DUMP
	_debug_dump_f.open("D:\\aacDump\\raw.yuv", std::ios_base::out | std::ios_base::binary);
#endif // RAM_DUMP

	if (_initialized)
	{
		return 0;
	}

	int ret = 0;
	if (_use_ffmpeg)
	{
		do
		{
			// avcodec_register_all();

			_av_codec_context.reset(avcodec_alloc_context3(nullptr));
			_av_codec_context->codec_type = AVMEDIA_TYPE_VIDEO;
			_av_codec_context->codec_id = AV_CODEC_ID_H264;
			_av_codec_context->extradata = nullptr;
			_av_codec_context->extradata_size = 0;
			_av_codec_context->thread_count = 1;
			_av_codec_context->thread_type = FF_THREAD_SLICE;
			_av_codec_context->err_recognition |= AV_EF_EXPLODE;

			const AVCodec *codec = avcodec_find_decoder_by_name("h264_qsv");
			if (codec == nullptr)
			{
				codec = avcodec_find_decoder(_av_codec_context->codec_id);
			}
			else
			{
				// std::cout << "found h264 qvs decoder........." << std::endl;
			}

			if (!codec)
			{
				// simpleLog("Failed to find %s codec %d.", av_get_media_type_string(type), st->codecpar->codec_id);
				ret = AVERROR(EINVAL);
				break;
			}

			if ((ret = avcodec_open2(_av_codec_context.get(), codec, NULL)) != 0)
			{
				// simpleLog("Failed to open %s codec.", av_get_media_type_string(type));
				ret = AVERROR(EINVAL);
				break;
			}
			_av_pkt = av_packet_alloc();
			_av_frame.reset(av_frame_alloc());
			// std::cout << "H264Decoder::Init" << std::endl;
			_initialized = true;

		} while (0);
	}
	else
	{
		do
		{
			/* code */
			memset(&_sDstBufInfo, 0, sizeof(SBufferInfo));
			ret = WelsCreateDecoder(&_pSvcDecoder);
			if (ret != 0)
			{
				std::cout << "Create Open H264 Decoder Failed!" << std::endl;
				break;
			}

			_sDecParam.sVideoProperty.eVideoBsType = VIDEO_BITSTREAM_DEFAULT;
			_sDecParam.uiTargetDqLayer = UCHAR_MAX;
			_sDecParam.eEcActiveIdc = ERROR_CON_SLICE_COPY;

			ret = _pSvcDecoder->Initialize(&_sDecParam);
			if (ret != 0)
			{
				std::cout << "Initialize Open H264 Decoder Failed!" << std::endl;
				WelsDestroyDecoder(_pSvcDecoder);
				break;
			}

			_initialized = true;
		} while (0);
	}

	return ret;
}

void H264Decoder::Uninit()
{
	do
	{
		Release();
		_initialized = false;
		// std::cout << "H264Decoder::Uninit" << std::endl;
		// if (_y_buffer)
		// {
		// 	delete _y_buffer;
		// }

		// if (_u_buffer)
		// {
		// 	delete _u_buffer;
		// }

		// if (_v_buffer)
		// {
		// 	delete _v_buffer;
		// }
		_video_callback = nullptr;
#ifdef RAM_DUMP
		_debug_dump_f.close();
#endif // RAM_DUMP

	} while (0);
}

int32_t H264Decoder::Release()
{
	_av_codec_context.reset();
	_av_frame.reset();
	av_packet_free(&_av_pkt);

	if (_pSvcDecoder)
	{
		_pSvcDecoder->Uninitialize();
		WelsDestroyDecoder(_pSvcDecoder);
	}
	return 0;
}

ErrorCode H264Decoder::Decode(uint8_t *data, int32_t len, uint32_t ts)
{
	if (data == nullptr || len == 0)
	{
		return kErrorCode_Success;
	}

	_timer.reset();
// 	if (!_use_ffmpeg)
// 	{
// 		uint8_t *pData[3];
// 		DECODING_STATE iRet = _pSvcDecoder->DecodeFrame2(data, len, pData, &_sDstBufInfo);
// 		// decode failed
// 		if (iRet != 0)
// 		{
// 			// std::cout << "error handling (RequestIDR or something like that) " << iRet << ", src data size = " << len << std::endl;
// 			return kErrorCode_OpenH264_Error;
// 		}
// 		// for Decoding only, pData can be used for render.
// 		if (_sDstBufInfo.iBufferStatus == 1)
// 		{
// 			if (_pix_fmt != _sDstBufInfo.UsrData.sSystemBuffer.iFormat || _width != _sDstBufInfo.UsrData.sSystemBuffer.iWidth || _height != _sDstBufInfo.UsrData.sSystemBuffer.iHeight)
// 			{
// 				_pix_fmt = _sDstBufInfo.UsrData.sSystemBuffer.iFormat;
// 				_width = _sDstBufInfo.UsrData.sSystemBuffer.iWidth;
// 				_height = _sDstBufInfo.UsrData.sSystemBuffer.iHeight;

// 				// std::lock_guard<std::mutex> locker(_mutex_video_callback);
// 				if (_video_param_callback)
// 				{
// 					// std::cout << "_video_param_callback................. bps = " << _bps << std::endl;
// 					_video_param_callback(_duration, _fps, _bps, _pix_fmt, _width, _height);
// 				}
// 			}

// 			int32_t ySize = _sDstBufInfo.UsrData.sSystemBuffer.iWidth * _height;
// 			int32_t uvSize = (_sDstBufInfo.UsrData.sSystemBuffer.iWidth >> 1) * (_height >> 1);
// 			// if (_y_size < yStride)
// 			// {
// 			// 	delete _y_buffer;
// 			// 	_y_buffer = new uint8_t[yStride];
// 			// 	_y_size = yStride;
// 			// }
// 			// if (_uv_size < uvStride)
// 			// {
// 			// 	delete _u_buffer;
// 			// 	delete _v_buffer;
// 			// 	_u_buffer = new uint8_t[_uv_size];
// 			// 	_v_buffer = new uint8_t[_uv_size];
// 			// }
// 			// int i = 0;
// 			// unsigned char *src = NULL;
// 			// unsigned char *dst = _y_buffer;
// 			// for (i = 0; i < _height; i++)
// 			// {
// 			// 	src = pData[0] + i * _sDstBufInfo.UsrData.sSystemBuffer.iStride[0];
// 			// 	memcpy(dst, src, _width);
// 			// 	dst += _width;
// 			// }
// 			// dst = _u_buffer;
// 			// for (i = 0; i < _height / 2; i++)
// 			// {
// 			// 	src = pData[1] + i * _sDstBufInfo.UsrData.sSystemBuffer.iStride[1];
// 			// 	memcpy(dst, src, _width / 2);
// 			// 	dst += _width / 2;
// 			// }
// 			// dst = _v_buffer;
// 			// for (i = 0; i < _height / 2; i++)
// 			// {
// 			// 	src = pData[2] + i * _sDstBufInfo.UsrData.sSystemBuffer.iStride[1];
// 			// 	memcpy(dst, src, _width / 2);
// 			// 	dst += _width / 2;
// 			// }

// 			// double timestamp = (double)(ts * 1.0 / 1000);
// 			// timestamp = (double)frame->pts * av_q2d(_av_codec_context->time_base);
// 			// std::lock_guard<std::mutex> locker(_mutex_video_callback);
// 			if (_video_callback)
// 			{
// 				_video_callback(pData[0], ySize, pData[1], uvSize, pData[2], uvSize,  (double)(ts * 1.0 / 1000), _timer.elapsed(), _time_last_init, len);
// 			}
// 			else
// 			{
// 				std::cout << "Video timestamp : " <<  (double)(ts * 1.0 / 1000) << std::endl;
// #ifdef RAM_DUMP
// 				_debug_dump_f.write((char *)_yuv_buffer, video_size);
// #endif // RAM_DUMP
// 			}

// 			// std::cout << "output handling (pData[0], pData[1], pData[2])" << std::endl;
// 		}
// 		return kErrorCode_Success;
// 	}

	ErrorCode ret = kErrorCode_Success;

	_av_pkt->data = data;
	_av_pkt->size = len;
	ret = DecodePacket(_av_pkt, ts);
	return ret;
}

ErrorCode H264Decoder::DecodePacket(AVPacket *pkt, uint32_t ts)
{
	int ret = 0;

	if (pkt == NULL)
	{
		// simpleLog("decodePacket invalid param.");
		return kErrorCode_Invalid_Param;
	}

	// std::cout << "H264Decoder::DecodePacket, avcodec_send_packet before, pkt.size : " << pkt->size << " ................." << std::endl;
	ret = avcodec_send_packet(_av_codec_context.get(), pkt);
	if (ret < 0)
	{
		// std::cout <<"Error sending a packet for decoding " << AVERROR(ret) << std::endl;
		return kErrorCode_FFmpeg_Error;
	}
	// std::cout << "H264Decoder::DecodePacket, avcodec_send_packet after, pkt.size : " << pkt->size << " ................." << std::endl;
	// while (ret >= 0)
	// {
	ret = avcodec_receive_frame(_av_codec_context.get(), _av_frame.get());
	// simpleLog("avcodec_receive_frame -> ret = %d", ret);
	if (ret == AVERROR(EAGAIN))
	{
		av_frame_unref(_av_frame.get());
		avcodec_flush_buffers(_av_codec_context.get());
		return kErrorCode_NoEnoughData;
	}
	else if (ret == AVERROR_EOF)
	{
		av_frame_unref(_av_frame.get());
		avcodec_flush_buffers(_av_codec_context.get());
		return kErrorCode_Eof;
	}
	else if (ret < 0)
	{
		av_frame_unref(_av_frame.get());
		// simpleLog("Error during decoding %d.", ret);
		avcodec_flush_buffers(_av_codec_context.get());
		return kErrorCode_FFmpeg_Error;
	}
	else
	{
		if (_pix_fmt != _av_frame->format || _width != _av_frame->linesize[0] || _height != _av_frame->height)
		{
			_pix_fmt = _av_frame->format;
			_width = _av_frame->linesize[0];
			_height = _av_frame->height;

			// std::lock_guard<std::mutex> locker(_mutex_video_callback);
			if (_video_param_callback)
			{
				// std::cout << "_video_param_callback................. bps = " << _bps << std::endl;
				_video_param_callback(_duration, _fps, _bps, _pix_fmt, _width, _height);
			}
		}

		int r = ProcessDecodedVideoFrame(_av_frame.get(), ts, pkt->size);
		av_frame_unref(_av_frame.get());

		if (r == kErrorCode_Old_Frame)
		{
			avcodec_flush_buffers(_av_codec_context.get());
			return (ErrorCode)r;
		}
	}
	// }
	return kErrorCode_Success;
}

ErrorCode H264Decoder::CopyYuvData(AVFrame *frame, unsigned char *buffer, int width, int height)
{
	unsigned char *src = NULL;
	unsigned char *dst = buffer;
	if (frame == NULL || buffer == NULL)
	{
		return kErrorCode_Invalid_Param;
	}

	if (!frame->data[0] || !frame->data[1] || !frame->data[2])
	{
		return kErrorCode_Invalid_Param;
	}
	// std::cout << "y linesize = " << frame->linesize[0] << ", u linesize = " << frame->linesize[1] << ", v linesize = " << frame->linesize[2] << std::endl;
	memcpy(dst, frame->data[0], width * height);
	dst += width * height;
	memcpy(dst, frame->data[1], (width >> 1) * (height >> 1));
	dst += (width >> 1) * (height >> 1);
	memcpy(dst, frame->data[2], (width >> 1) * (height >> 1));
	// for (i = 0; i < height; i++)
	// {
	// 	src = frame->data[0] + i * frame->linesize[0];
	// 	memcpy(dst, src, width);
	// 	dst += width;
	// }

	// for (i = 0; i < height / 2; i++)
	// {
	// 	src = frame->data[1] + i * frame->linesize[1];
	// 	memcpy(dst, src, width / 2);
	// 	dst += width / 2;
	// }

	// for (i = 0; i < height / 2; i++)
	// {
	// 	src = frame->data[2] + i * frame->linesize[2];
	// 	memcpy(dst, src, width / 2);
	// 	dst += width / 2;
	// }
	return kErrorCode_Success;
}

ErrorCode H264Decoder::ProcessDecodedVideoFrame(AVFrame *frame, uint32_t ts, int32_t datasize)
{
	if (frame == NULL)
	{
		return kErrorCode_Invalid_Param;
	}

	// int32_t video_size = av_image_get_buffer_size(
	// 	_av_codec_context->pix_fmt,
	// 	frame->linesize[0],
	// 	_av_codec_context->height, 4);
	// if (_cur_video_size < video_size)
	// {
	// 	_cur_video_size = video_size;
	// 	delete _yuv_buffer;
	// 	_yuv_buffer = new uint8_t[_cur_video_size];
	// 	// std::cout <<"H264Decoder::ProcessDecodedVideoFrame, malloc memory, size : " << _cur_video_size << std::endl;
	// }

	if (_av_codec_context->pix_fmt != AV_PIX_FMT_YUV420P)
	{
		// simpleLog("Not YUV420P, but unsupported format %d.", decoder->videoCodecContext->pix_fmt);
		return kErrorCode_Invalid_Format;
	}

	// if (CopyYuvData(frame, _yuv_buffer, frame->linesize[0], _av_codec_context->height) != kErrorCode_Success)
	// {
	// 	return kErrorCode_Invalid_Param;
	// }
	int32_t y_size = frame->linesize[0] * _av_codec_context->height;
	int32_t uv_size = (frame->linesize[0] >> 1) * (_av_codec_context->height >> 1);
	// if (_y_size < y_size)
	// {
	// 	delete _y_buffer;
	// 	_y_buffer = new uint8_t[y_size];
	// 	_y_size = y_size;
	// }
	// memcpy(_y_buffer, frame->data[0], y_size);
	// if (_uv_size < uv_size)
	// {
	// 	delete _u_buffer;
	// 	delete _v_buffer;
	// 	_u_buffer = new uint8_t[uv_size];
	// 	_v_buffer = new uint8_t[uv_size];
	// 	_uv_size = uv_size;
	// }
	// memcpy(_u_buffer, frame->data[1], _uv_size);
	// memcpy(_v_buffer, frame->data[2], _uv_size);
	// timestamp = (double)frame->pts * av_q2d(_av_codec_context->time_base);
	// std::lock_guard<std::mutex> locker(_mutex_video_callback);
	if (_video_callback)
	{
		double consuming = _timer.elapsed();
		_video_callback(frame->data[0], y_size, frame->data[1], uv_size, frame->data[2], uv_size, (double)(ts * 1.0 / 1000), consuming, _time_last_init, datasize);
	}
	else
	{
		// std::cout << "Video timestamp : " << (double)(ts * 1.0 / 1000) << std::endl;
#ifdef RAM_DUMP
		_debug_dump_f.write((char *)_yuv_buffer, video_size);
#endif // RAM_DUMP
	}
	return kErrorCode_Success;
}
