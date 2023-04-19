#include "tag.h"
#include "common.h"

#include <string.h>
#include <algorithm>
#include <iostream>

uint64_t u64DateSize = 0;

Tag::Tag()
	: _pTagData(NULL), _pMedia(NULL), _nMediaLen(0)
{
	std::cout << "Tag Data Construct........" << std::endl;
	_nNeedDataLen = 0;
	_nMediaSize = 0;
}

Tag::~Tag()
{
	if (_pTagData)
	{
		delete _pTagData;
		_pTagData = nullptr;
		std::cout << "Tag Data Release........" << std::endl;
	}
}

int32_t Tag::Init(uint8_t *pBuf, int nLeftLen)
{
	if (nLeftLen < 11)
	{
		std::cout <<"Tag::Init......" << std::endl;
		return -1;
	}

	_header.nDataSize = ShowU24(pBuf + 1);
	if (_header.nDataSize > _TagDataSize || _pTagData == nullptr)
	{
		
		_TagDataSize = _header.nDataSize;
		delete _pTagData;
		_pTagData = new uint8_t[_header.nDataSize];
	}

	_header.nType = ShowU8(pBuf + 0);
	_header.nTimeStamp = ShowU24(pBuf + 4);
	_header.nTSEx = ShowU8(pBuf + 7);
	_header.nStreamID = ShowU24(pBuf + 8);
	_header.nTotalTS = (uint32_t)((_header.nTSEx << 24)) + _header.nTimeStamp;

	int32_t real_data = _header.nDataSize; 
	if (real_data > nLeftLen - 11)
	{
		real_data = nLeftLen - 11;
	}

	memcpy(_pTagData, pBuf + 11, real_data);

	_nNeedDataLen = _header.nDataSize - real_data;

	return (real_data + 11);
}

int32_t Tag::Append(uint8_t *pBuf, int nLeftLen)
{
	int32_t real_data = _nNeedDataLen;
	if (_nNeedDataLen > nLeftLen)
	{
		real_data = nLeftLen;
	}
	memcpy(_pTagData + _header.nDataSize - _nNeedDataLen, pBuf, real_data);

	_nNeedDataLen = _nNeedDataLen - real_data;

	return real_data;
}
