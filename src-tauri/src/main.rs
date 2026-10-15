// Keeps a console window from flashing up next to the app in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    openmark_lib::run()
}
