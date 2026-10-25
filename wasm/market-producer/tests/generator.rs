use market_producer::generator::{Generator, GeneratorError};
use market_producer::model::RECORD_WORDS;

#[test]
fn generates_requested_counts_and_valid_records_with_evolving_instrument_state() {
    for instrument_count in [1, 50] {
        let mut generator = Generator::new(instrument_count, 42).unwrap();
        let mut midpoints: Vec<i64> = (0..instrument_count)
            .map(|id| i64::from(10_000 + id * 137))
            .collect();
        let mut moved = false;
        for count in [1, 100, 1_000] {
            let batch = generator.generate_batch(count).unwrap();
            assert_eq!(batch.len(), count as usize * RECORD_WORDS);
            for [id, price, quantity, bid, ask, bid_quantity, ask_quantity] in
                batch.as_chunks::<RECORD_WORDS>().0
            {
                assert!(*id < instrument_count);
                assert!((1..=1_000_009).contains(price));
                assert!((1..=1_000).contains(quantity));
                assert!((1..=999_999).contains(bid));
                assert!((3..=1_000_009).contains(ask));
                assert!((2..=10).contains(&(ask - bid)));
                assert!(*price == *bid || *price == *ask);
                assert!(*bid_quantity <= 10_000);
                assert!(*ask_quantity <= 10_000);
                let midpoint = i64::from(bid + 1);
                let previous = &mut midpoints[*id as usize];
                assert!((midpoint - *previous).abs() <= 5);
                moved |= midpoint != *previous;
                *previous = midpoint;
            }
        }
        assert!(moved, "Fixed seed must exercise price movement");
    }
}

#[test]
fn reproduces_fixed_seed_records_and_draw_order() {
    let mut generator = Generator::new(5, 1).unwrap();
    assert_eq!(
        generator.generate_batch(1).unwrap(),
        [4, 10551, 234, 10543, 10551, 962, 2245]
    );
    for seed in [0, 1, 42, u32::MAX] {
        let mut first = Generator::new(50, seed).unwrap();
        let mut second = Generator::new(50, seed).unwrap();
        for count in [1, 100, 1_000] {
            assert_eq!(
                first.generate_batch(count).unwrap(),
                second.generate_batch(count).unwrap()
            );
        }
    }
}

#[test]
fn normalizes_zero_seed() {
    assert_eq!(
        Generator::new(5, 0).unwrap().generate_batch(100).unwrap(),
        Generator::new(5, 0x6d2b79f5)
            .unwrap()
            .generate_batch(100)
            .unwrap()
    );
}

#[test]
fn consecutive_calls_match_one_combined_call() {
    let mut split = Generator::new(5, 123).unwrap();
    let mut combined = Generator::new(5, 123).unwrap();
    let mut records = split.generate_batch(400).unwrap();
    records.extend(split.generate_batch(600).unwrap());
    assert_eq!(records, combined.generate_batch(1_000).unwrap());
    let ids: Vec<_> = records
        .as_chunks::<RECORD_WORDS>()
        .0
        .iter()
        .map(|r| r[0])
        .collect();
    assert!(ids.windows(2).any(|pair| pair[0] == pair[1]));
}

#[test]
fn rejects_invalid_instrument_counts_before_allocation() {
    for count in [0, 51, u32::MAX] {
        assert!(matches!(
            Generator::new(count, 1),
            Err(GeneratorError::InvalidInstrumentCount)
        ));
    }
}

#[test]
fn failed_batch_requests_preserve_all_generator_state() {
    let mut generator = Generator::new(5, 42).unwrap();
    let mut reference = Generator::new(5, 42).unwrap();
    assert_eq!(
        generator.generate_batch(100).unwrap(),
        reference.generate_batch(100).unwrap()
    );
    for count in [0, 1_001, u32::MAX] {
        assert_eq!(
            generator.generate_batch(count),
            Err(GeneratorError::InvalidBatchCount)
        );
        assert_eq!(
            generator.generate_batch(100).unwrap(),
            reference.generate_batch(100).unwrap()
        );
    }
}
