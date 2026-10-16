fn main() {
    // The frontend is embedded into the binary at compile time by `tauri::generate_context!`,
    // but `tauri_build::build()` does not watch the `frontendDist` directory. A change to
    // `dist/` alone therefore left the binary stale while cargo reported "Finished": the
    // desktop E2E then drove an app that did not contain the code under test, and passed.
    //
    // Two anchors, deliberately. The directory covers `dist/assets/*`, whose file names are
    // content-hashed and therefore unguessable; `index.html` is watched separately because it is
    // rewritten on every build and its own mtime does not change the mtime of the directory
    // holding it, so a cargo that fingerprints only the listed path still relinks.
    println!("cargo:rerun-if-changed=../dist");
    println!("cargo:rerun-if-changed=../dist/index.html");
    tauri_build::build()
}
