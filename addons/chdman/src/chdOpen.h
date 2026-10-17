#pragma once

#include <string>
#include <system_error>

#include "chd.h"

/**
 * Open the CHD at `path` read-only. Other processes can write, rename, and delete the file while
 * it is open, on every OS. MAME's own chd_file::open() only shares reads on Windows.
 */
std::error_condition OpenChdForReading(chd_file& chd, const std::string& path);
