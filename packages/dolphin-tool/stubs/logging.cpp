// Stub for Dolphin's logging sink.
//
// Common/Logging/Log.h routes every LOG/ERROR/WARN macro through
// Common::Log::GenericLogFmtImpl, whose real implementation (Logging/LogManager.cpp)
// pulls in the whole configurable logging subsystem (config, files, consoles,
// threads). The addon never surfaces Dolphin logs, so this no-op sink satisfies
// the single referenced symbol. Dolphin submodule tag 2606.

#include "Common/Logging/Log.h"

namespace Common::Log
{
void GenericLogFmtImpl(LogLevel level, LogType type, const char* file, int line,
                       fmt::string_view format, const fmt::format_args& args)
{
}
}  // namespace Common::Log
