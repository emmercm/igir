#pragma once

// CPP/7zip/Archive/Common/HandlerOut.h omits CMultiMethodProps and CSingleMethodProps
// entirely when Z7_EXTRACT_ONLY is defined -- their real SetProperty/SetProperties
// bodies live in the write-path HandlerOut.cpp, which this decode-only addon does not
// compile. Most handlers
// (CPP/7zip/Archive/7z/7zHandler.h) correctly fall back to CCommonMethodProps under
// Z7_EXTRACT_ONLY, but CPP/7zip/Archive/Zip/ZipCompressionMode.h does not: it
// unconditionally derives CBaseProps from CMultiMethodProps, and ZipHandler.h holds a
// CBaseProps _props member that is default-constructed and Init()'d on every archive
// open -- so the type must exist, and Init() must run correctly, even though nothing
// in a decode-only build ever calls SetProperty/SetProperties on it.
//
// This header supplies real (but non-encoding) definitions: field initialization only,
// matching the *behavior* of upstream's HandlerOut.cpp Init()/InitMulti()/InitSingle().
// SetProperty(s) return E_NOTIMPL, matching real ISetProperties::SetProperties'
// contract for a property this handler declines -- never called here since this addon
// never invokes ISetProperties on its own handlers.
//
// Force-included (see binding.gyp's "-include") ahead of every 7-Zip Archive C++
// source, so it is visible by the time ZipCompressionMode.h needs it. Because the real
// HandlerOut.h always omits these classes under Z7_EXTRACT_ONLY, there is no
// redefinition.

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
