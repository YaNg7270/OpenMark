fn main() {
    // The frontend is embedded into the binary at compile time by `tauri::generate_context!`,
    // but `tauri_build::build()` does not watch the `frontendDist` directory. A change to
    // `dist/` alone therefore left the binary stale while cargo reported "Finished": the
    // desktop E2E then drove an app that did not contain the code under test, and passed.
    //
    // Cargo expands a `rerun-if-changed` directory to its whole tree, so this re-embeds the
    // frontend whenever it is rebuilt. Without it, `pnpm build` followed by `cargo build`
    // produces a binary whose UI is older than the sources.
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build()
}
