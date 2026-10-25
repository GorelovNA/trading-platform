use wasm_bindgen::prelude::*;

/// Integration proof only; the stateful generator is implemented in step 2.
#[wasm_bindgen]
pub fn protocol_version() -> u32 {
    1
}

#[cfg(test)]
mod tests {
    use super::protocol_version;

    #[test]
    fn exports_the_expected_protocol() {
        assert_eq!(protocol_version(), 1);
    }
}
