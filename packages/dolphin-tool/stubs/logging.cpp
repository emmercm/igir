// No-op stub for Common::Log::GenericLogFmtImpl, which every LOG/ERROR/WARN macro
// in Common/Logging/Log.h routes through. The real implementation (LogManager.cpp)
// pulls in the whole configurable logging subsystem; the addon never surfaces logs.

#include "Common/Logging/Log.h"

namespace Common::Log
{
void GenericLogFmtImpl(LogLevel level, LogType type, const char* file, int line,
                       fmt::string_view format, const fmt::format_args& args)
{
}
}  // namespace Common::Log
