#pragma once

// CMultiMethodProps and CSingleMethodProps, which upstream's HandlerOut.h omits
// entirely under Z7_EXTRACT_ONLY because their real bodies live in the write
// path this decode-only addon does not compile. Most handlers fall back to
// CCommonMethodProps in that case, but the Zip handler does not: it derives its
// CBaseProps from CMultiMethodProps unconditionally and default-constructs one
// on every archive open, so the type has to exist and Init() has to be correct
// even though SetProperty/SetProperties are never called. Those return
// E_NOTIMPL; Init() matches the field initialization upstream performs.
//
// Force-included ahead of every 7-Zip Archive source, so it is in place by the
// time the Zip handler needs it. There is no redefinition, since upstream
// always omits these classes under Z7_EXTRACT_ONLY.
//
// The __cplusplus guard is load-bearing on Windows: MSVC's forced-include flag
// has no C-versus-C++ split, so this header also lands on the target's C
// sources, which would otherwise pull in the C++ standard library and fail to
// compile. Guarding here keeps one mechanism for all three toolchains.

#ifdef __cplusplus

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
