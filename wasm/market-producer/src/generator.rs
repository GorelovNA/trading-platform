use crate::model::{InstrumentState, MAX_BATCH_COUNT, MAX_INSTRUMENTS, RECORD_WORDS};
use crate::prng::Prng;

#[derive(Debug, PartialEq, Eq)]
pub enum GeneratorError {
    InvalidInstrumentCount,
    InvalidBatchCount,
    AllocationFailed,
}

impl GeneratorError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidInstrumentCount => "INVALID_INSTRUMENT_COUNT",
            Self::InvalidBatchCount => "INVALID_BATCH_COUNT",
            Self::AllocationFailed => "ALLOCATION_FAILED",
        }
    }
}

pub struct Generator {
    instruments: Vec<InstrumentState>,
    prng: Prng,
}

impl Generator {
    pub fn new(instrument_count: u32, seed: u32) -> Result<Self, GeneratorError> {
        if !(1..=MAX_INSTRUMENTS).contains(&instrument_count) {
            return Err(GeneratorError::InvalidInstrumentCount);
        }
        let mut instruments = Vec::new();
        instruments
            .try_reserve_exact(instrument_count as usize)
            .map_err(|_| GeneratorError::AllocationFailed)?;
        instruments.extend((0..instrument_count).map(InstrumentState::new));
        Ok(Self {
            instruments,
            prng: Prng::new(seed),
        })
    }

    pub fn generate_batch(&mut self, count: u32) -> Result<Vec<u32>, GeneratorError> {
        if !(1..=MAX_BATCH_COUNT).contains(&count) {
            return Err(GeneratorError::InvalidBatchCount);
        }
        let word_count = usize::try_from(count)
            .ok()
            .and_then(|count| count.checked_mul(RECORD_WORDS))
            .ok_or(GeneratorError::AllocationFailed)?;
        let mut words = Vec::new();
        // Complete all fallible allocation before advancing any simulation state.
        words
            .try_reserve_exact(word_count)
            .map_err(|_| GeneratorError::AllocationFailed)?;
        for _ in 0..count {
            let instrument_id = self.prng.next() % self.instruments.len() as u32;
            let instrument = &mut self.instruments[instrument_id as usize];
            let movement = i64::from(self.prng.next() % 11) - 5;
            instrument.move_price(movement);
            let bid = instrument.midpoint_cents - 1;
            let ask = instrument.midpoint_cents + 1 + self.prng.next() % 9;
            let trade_price = if self.prng.next() & 1 == 0 { bid } else { ask };
            let trade_quantity = 1 + self.prng.next() % 1_000;
            let bid_quantity = self.prng.next() % 10_001;
            let ask_quantity = self.prng.next() % 10_001;
            words.extend_from_slice(&[
                instrument_id,
                trade_price,
                trade_quantity,
                bid,
                ask,
                bid_quantity,
                ask_quantity,
            ]);
        }
        Ok(words)
    }
}
