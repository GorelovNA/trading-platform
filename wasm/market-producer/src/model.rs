pub const PROTOCOL_VERSION: u32 = 1;
pub const RECORD_WORDS: usize = 7;
pub const MAX_INSTRUMENTS: u32 = 50;
pub const MAX_BATCH_COUNT: u32 = 1_000;
pub const MIN_MIDPOINT: i64 = 2;
pub const MAX_MIDPOINT: i64 = 1_000_000;

pub struct InstrumentState {
    pub midpoint_cents: u32,
}

impl InstrumentState {
    pub fn new(instrument_id: u32) -> Self {
        Self {
            midpoint_cents: 10_000 + instrument_id * 137,
        }
    }

    pub fn move_price(&mut self, movement: i64) {
        self.midpoint_cents =
            (i64::from(self.midpoint_cents) + movement).clamp(MIN_MIDPOINT, MAX_MIDPOINT) as u32;
    }
}

#[cfg(test)]
mod tests {
    use super::InstrumentState;

    #[test]
    fn clamps_signed_movement_at_both_price_bounds() {
        let mut instrument = InstrumentState { midpoint_cents: 2 };
        instrument.move_price(-5);
        assert_eq!(instrument.midpoint_cents, 2);
        instrument.move_price(5);
        assert_eq!(instrument.midpoint_cents, 7);
        instrument.midpoint_cents = 1_000_000;
        instrument.move_price(5);
        assert_eq!(instrument.midpoint_cents, 1_000_000);
        instrument.move_price(-5);
        assert_eq!(instrument.midpoint_cents, 999_995);
    }
}
