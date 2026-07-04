// Stubs for IOS::ES::TicketReader::IsValid/GetTitleKey, referenced only by WIABlob.cpp's
// WIARVZFileReader::SetUpDataEntriesForWriting (WIA/RVZ *writing*), which this read-only
// addon never runs. The real Formats.cpp pulls in the IOS/ES title stack. A Windows DLL
// must resolve every referenced symbol; Linux/macOS tolerate them as undefined.

#include "Core/IOS/ES/Formats.h"

#include <array>

namespace IOS::ES {
bool TicketReader::IsValid() const { return false; }
std::array<u8, 16> TicketReader::GetTitleKey() const { return {}; }
}  // namespace IOS::ES
