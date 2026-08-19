cmake_minimum_required(VERSION 3.14)
project(nihongo_bridge LANGUAGES CXX)

set(BINARY_NAME "nihongo_bridge")

cmake_policy(VERSION 3.14...3.25)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_definitions(-DUNICODE -D_UNICODE)

add_subdirectory("flutter")
add_subdirectory("runner")
