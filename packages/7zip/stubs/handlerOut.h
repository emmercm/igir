#pragma once

// CMultiMethodProps and CSingleMethodProps, which upstream's HandlerOut.h omits
// entirely under Z7_EXTRACT_ONLY because their real bodies live in the write
// path this decode-only addon does not compile. Two decode handlers still need
// them: the Zip handler derives its CBaseProps from CMultiMethodProps, and the
// bzip2 handler holds a CSingleMethodProps member, each default-constructed on
// every archive open. So the types have to exist and Init() has to match the
// field initialization upstream performs, even though SetProperty and
// SetProperties are never called and return E_NOTIMPL.
//
// Force-included ahead of every 7-Zip Archive source, so it is in place by the
// time those handlers need it. There is no redefinition, since upstream
// always omits these classes under Z7_EXTRACT_ONLY.
//
// The __cplusplus guard is load-bearing on Windows: MSVC's forced-include flag
// has no C-versus-C++ split, so this header also lands on the target's C
// sources, which would otherwise pull in the C++ standard library and fail to
// compile. Guarding here keeps one mechanism for all three toolchains.

#ifdef __cplusplus

// HandlerOut.h pulls in Windows/System.h -> Common/MyWindows.h -> C/7zWindows.h,
// which does a bare `#include <windows.h>`. Since this header is force-included
// ahead of every source, that would otherwise be the first thing any
// translation unit sees, dragging in the legacy <winsock.h> before anything
// else gets a say. asyncSignal.h later includes <uv.h>, which needs
// <winsock2.h>, and the two winsock headers cannot coexist -- MSVC fails with
// redefinition errors (sockaddr, fd_set, etc.) inside <uv.h>. Pulling in
// <winsock2.h> here first, before HandlerOut.h's chain reaches <windows.h>,
// makes it win that race everywhere instead of only where a source happens to
// include <uv.h> before any 7-Zip header.
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#endif  // _WIN32

#include "7zip/Archive/Common/HandlerOut.h"

#ifdef Z7_EXTRACT_ONLY

namespace NArchive {

class CMultiMethodProps : public CCommonMethodProps {
public:
    UInt32 _crcSize;
    CObjectVector<COneMethodInfo> _methods;
    COneMethodInfo _filterMethod;
    bool _autoFilter;

    void Init() {
        InitCommon();
        _crcSize = 4;
        _autoFilter = true;
        _methods.Clear();
        _filterMethod.Clear();
    }

    CMultiMethodProps() { Init(); }

    HRESULT SetProperty(const wchar_t* /* name */, const PROPVARIANT& /* value */) {
        return E_NOTIMPL;
    }
};

class CSingleMethodProps : public COneMethodInfo, public CCommonMethodProps {
public:
    void Init() { InitCommon(); }

    CSingleMethodProps() { Init(); }

    HRESULT SetProperty(const wchar_t* /* name */, const PROPVARIANT& /* value */) {
        return E_NOTIMPL;
    }

    HRESULT SetProperties(const wchar_t* const* /* names */, const PROPVARIANT* /* values */,
                           UInt32 /* numProps */) {
        return E_NOTIMPL;
    }
};

}  // namespace NArchive

#endif  // Z7_EXTRACT_ONLY

#endif  // __cplusplus
