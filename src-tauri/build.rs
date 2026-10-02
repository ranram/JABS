use std::{fs, path::{Path, PathBuf}};

fn main() {
    println!("cargo:rerun-if-env-changed=JABS_UPDATER_PUBLIC_KEY");
    generate_web_assets();
    tauri_build::build()
}

fn generate_web_assets() {
    let manifest = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").expect("Cargo manifest directory"));
    let dist = manifest.parent().expect("Tauri directory must have a parent").join("dist");
    println!("cargo:rerun-if-changed={}", dist.display());
    let mut files = Vec::new();
    collect_files(&dist, &dist, &mut files);
    files.sort_by(|left, right| left.0.cmp(&right.0));
    let entries = files.into_iter().map(|(relative, path)| {
        format!("({relative:?}, include_bytes!({:?}).as_slice()),", path.to_string_lossy())
    }).collect::<Vec<_>>().join("\n");
    let generated = format!("pub static WEB_ASSETS: &[(&str, &[u8])] = &[\n{entries}\n];\n");
    let output = PathBuf::from(std::env::var_os("OUT_DIR").expect("Cargo output directory"))
        .join("web_assets.rs");
    fs::write(output, generated).expect("write generated web asset manifest");
}

fn collect_files(root: &Path, directory: &Path, files: &mut Vec<(String, PathBuf)>) {
    let Ok(entries) = fs::read_dir(directory) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files(root, &path, files);
        } else if path.is_file() {
            let relative = path.strip_prefix(root).expect("web asset must remain below dist")
                .to_string_lossy().replace('\\', "/");
            files.push((relative, path));
        }
    }
}
