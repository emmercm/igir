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

#include "7zip/Archive/Common/HandlerOut.h"

#ifdef Z7_EXTRACT_ONLY

namespace NArchive {

/** Supplies the archive handlers with the decode-relevant multi-method state. */
class CMultiMethodProps : public CCommonMethodProps {
   public:
    UInt32 _crcSize;
    CObjectVector<COneMethodInfo> _methods;
    COneMethodInfo _filterMethod;
    bool _autoFilter;

    /** Restores the same default property state as the upstream write-capable class. */
    void Init() {
        InitCommon();
        _crcSize = 4;
        _autoFilter = true;
        _methods.Clear();
        _filterMethod.Clear();
    }

    /** Constructs the property container with upstream-compatible defaults. */
    CMultiMethodProps() { Init(); }

    /** Rejects write-only property configuration in this extract-only build. */
    HRESULT SetProperty(const wchar_t* /* name */, const PROPVARIANT& /* value */) { return E_NOTIMPL; }
};

/** Supplies the archive handlers with the decode-relevant single-method state. */
class CSingleMethodProps : public COneMethodInfo, public CCommonMethodProps {
   public:
    /** Restores the common property defaults used by upstream handlers. */
    void Init() { InitCommon(); }

    /** Constructs the property container with upstream-compatible defaults. */
    CSingleMethodProps() { Init(); }

    /** Rejects write-only property configuration in this extract-only build. */
    HRESULT SetProperty(const wchar_t* /* name */, const PROPVARIANT& /* value */) { return E_NOTIMPL; }

    /** Rejects batches of write-only properties in this extract-only build. */
    HRESULT SetProperties(const wchar_t* const* /* names */, const PROPVARIANT* /* values */, UInt32 /* numProps */) {
        return E_NOTIMPL;
    }
};

}  // namespace NArchive

#endif  // Z7_EXTRACT_ONLY

#endif  // __cplusplus
