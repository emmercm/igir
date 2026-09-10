#pragma once

#include <string>
#include <string_view>

namespace sevenzip {

/** Clears the current producer thread's decoder diagnostic before an extraction starts. */
void ClearCodecError() noexcept;

/** Records a non-owning decoder diagnostic in bounded thread-local storage without throwing. */
void SetCodecError(std::string_view message) noexcept;

/** Returns the current producer thread's decoder diagnostic and clears it. */
std::string TakeCodecError();

}  // namespace sevenzip
