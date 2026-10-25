use wasm_bindgen::prelude::*;

pub mod generator;
pub mod model;
mod prng;

use generator::Generator;

#[wasm_bindgen]
pub fn protocol_version() -> u32 {
    model::PROTOCOL_VERSION
}

#[wasm_bindgen]
pub struct MarketProducer {
    generator: Generator,
}

#[wasm_bindgen]
impl MarketProducer {
    #[wasm_bindgen(constructor)]
    pub fn new(instrument_count: u32, seed: u32) -> Result<MarketProducer, JsValue> {
        Generator::new(instrument_count, seed)
            .map(|generator| Self { generator })
            .map_err(|error| JsValue::from_str(error.code()))
    }

    pub fn generate_batch(&mut self, count: u32) -> Result<Vec<u32>, JsValue> {
        self.generator
            .generate_batch(count)
            .map_err(|error| JsValue::from_str(error.code()))
    }
}

#[cfg(test)]
mod tests {
    use super::protocol_version;

    #[test]
    fn exports_the_expected_protocol() {
        assert_eq!(protocol_version(), 1);
    }
}
