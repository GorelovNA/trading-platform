pub const ZERO_SEED: u32 = 0x6d2b79f5;

pub struct Prng {
    state: u32,
}

impl Prng {
    pub fn new(seed: u32) -> Self {
        Self {
            state: if seed == 0 { ZERO_SEED } else { seed },
        }
    }

    pub fn next(&mut self) -> u32 {
        let mut value = self.state;
        value ^= value << 13;
        value ^= value >> 17;
        value ^= value << 5;
        self.state = value;
        value
    }
}

#[cfg(test)]
mod tests {
    use super::Prng;

    #[test]
    fn matches_xorshift32_reference_sequence() {
        let mut prng = Prng::new(1);
        assert_eq!(
            std::array::from_fn::<_, 5, _>(|_| prng.next()),
            [270369, 67634689, 2647435461, 307599695, 2398689233]
        );
    }
}
