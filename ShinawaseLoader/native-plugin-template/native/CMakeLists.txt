cmake_minimum_required(VERSION 3.24)
# Example host DLL for echo-steam 26.8.28. The loader addon targets Electron 43.3.0.
project(echo_example_native C)
add_library(echo-example SHARED plugin.c)
target_include_directories(echo-example PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/../../native")
set_target_properties(echo-example PROPERTIES PREFIX "" OUTPUT_NAME "echo-example")
