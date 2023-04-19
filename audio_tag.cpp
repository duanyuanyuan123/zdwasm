#include "audio_tag.h"

#include <string.h>
#include <iostream>

int32_t AudioTag::_aacProfile = 0;
int32_t AudioTag::_sampleRateIndex = 0;
int32_t AudioTag::_channelConfig = 0;

AudioTag::AudioTag()
{
	std::cout << "AudioTag::AudioTag" << std::endl;
	_pTagData = NULL;
	_pMedia = NULL;
	_nMediaLen = 0;
	_nNeedDataLen = 0;
	_nMediaSize = 0;
}

AudioTag::~AudioTag()
{
	_aac_decoder.Uninit();
	if (_pMedia != nullptr)
	{
		delete _pMedia;
		_pMedia = nullptr;
		std::cout << "Audio Tag Media Release........" << std::endl;
	}
}

void AudioTag::SetAudioCallback(AudioParamCallback audio_param_callback, AudioCallback audio_callback)
{
	_aac_decoder.SetAudioCallback(audio_param_callback, audio_callback);
}

void AudioTag::SetSpeed(float speed)
{
	_aac_decoder.SetSpeed(speed);
}

// void AudioTag::Decode(unit8_t *buff, int size, uint32_t nTimeStamp)
// {
// 	if (!_aac_decoder.initialized())
// 	{
// 		_aac_decoder.Init();
// 	}

// 	if (_nMediaLen > 0)
// 	{
// 		_aac_decoder.Decode(_pMedia, _nMediaLen, _header.nTotalTS);
// 	}
// }

void AudioTag::Parse()
{
	if (_nNeedDataLen > 0)
	{
		return;
	}

	// unsigned char *pd = _pTagData;
	_nSoundFormat = (_pTagData[0] & 0xf0) >> 4;
	_nSoundRate = (_pTagData[0] & 0x0c) >> 2;
	_nSoundSize = (_pTagData[0] & 0x02) >> 1;
	_nSoundType = (_pTagData[0] & 0x01);
	if (_nSoundFormat == 10) // AAC
	{
		ParseAACTag();
		if (_nSoundFormat == 10)
		{
			if (!_aac_decoder.initialized())
			{
				_aac_decoder.Init();
			}

			_aac_decoder.Decode(_pMedia, _nMediaLen, _header.nTotalTS);
		}
	}
}

int AudioTag::ParseAACTag()
{
	unsigned char *pd = _pTagData;
	int nAACPacketType = pd[1];

	if (nAACPacketType == 1)
	{
		ParseRawAAC(pd);
	}
	else if (nAACPacketType == 0)
	{
		ParseAudioSpecificConfig(pd);
	}
	else
	{
	}

	return 1;
}

int AudioTag::ParseAudioSpecificConfig(unsigned char *pTagData)
{
	_aacProfile = ((_pTagData[2] & 0xf8) >> 3) - 1;
	_sampleRateIndex = ((_pTagData[2] & 0x07) << 1) | (_pTagData[3] >> 7);
	_channelConfig = (_pTagData[3] >> 3) & 0x0f;

	_pMedia = NULL;
	_nMediaLen = 0;

	return 1;
}

int AudioTag::ParseRawAAC(unsigned char *pTagData)
{
	uint64_t bits = 0;
	int dataSize = _header.nDataSize - 2;

	WriteU64(bits, 12, 0xFFF);
	WriteU64(bits, 1, 0);
	WriteU64(bits, 2, 0);
	WriteU64(bits, 1, 1);
	WriteU64(bits, 2, _aacProfile);
	WriteU64(bits, 4, _sampleRateIndex);
	WriteU64(bits, 1, 0);
	WriteU64(bits, 3, _channelConfig);
	WriteU64(bits, 1, 0);
	WriteU64(bits, 1, 0);
	WriteU64(bits, 1, 0);
	WriteU64(bits, 1, 0);
	WriteU64(bits, 13, 7 + dataSize);
	WriteU64(bits, 11, 0x7FF);
	WriteU64(bits, 2, 0);

	_nMediaLen = 7 + dataSize;
	if (_pMedia == nullptr || _nMediaLen > _nMediaSize)
	{
		delete _pMedia;
		_nMediaSize = _nMediaLen;
		_pMedia = new uint8_t[_nMediaSize];
		// std::cout << "AudioTag::ParseRawAAC, malloc memory, size : " << _nMediaSize << std::endl;
	}
	unsigned char p64[8];
	p64[0] = (unsigned char)(bits >> 56);
	p64[1] = (unsigned char)(bits >> 48);
	p64[2] = (unsigned char)(bits >> 40);
	p64[3] = (unsigned char)(bits >> 32);
	p64[4] = (unsigned char)(bits >> 24);
	p64[5] = (unsigned char)(bits >> 16);
	p64[6] = (unsigned char)(bits >> 8);
	p64[7] = (unsigned char)(bits);

	memcpy(_pMedia, p64 + 1, 7);
	memcpy(_pMedia + 7, pTagData + 2, dataSize);

	return 1;
}
