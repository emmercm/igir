// Stubs for IOS::ES::TicketReader::IsValid/GetTitleKey, referenced only by
// WIABlob.cpp's WIA/RVZ writing path, which this read-only addon never runs.
// Stubbed because a Windows DLL must resolve every referenced symbol.

#include "Core/IOS/ES/Formats.h"

#include <array>

namespace IOS::ES {
// These bodies ignore `this`, but Formats.h declares the members non-static.
// NOLINTNEXTLINE(readability-convert-member-functions-to-static)
bool TicketReader::IsValid() const { return false; }
// NOLINTNEXTLINE(readability-convert-member-functions-to-static)
std::array<u8, 16> TicketReader::GetTitleKey() const { return {}; }
}  // namespace IOS::ES
