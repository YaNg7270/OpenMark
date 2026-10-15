# Long List Items

Each item below wraps across several source lines while remaining a single list item, and there are deliberately no blank lines between them so the list stays tight.

- The first item describes the ingestion stage, where raw records arrive from a message queue. Each record carries a schema version, and records from different versions may coexist in the same batch, so the consumer must route them to the correct decoder before any validation happens.
- The second item covers normalisation, which rewrites timestamps into a single canonical timezone and trims redundant whitespace from free-text fields. Because normalisation is pure, it can be replayed safely over historical batches without ever touching the source store.
- The third item explains enrichment, joining each record against a slowly changing dimension table. The join key is stable, but the dimension itself changes daily, so the enrichment step records the snapshot identifier it used alongside every output row.
- The fourth item addresses persistence, which writes the enriched record into a columnar store partitioned by event date. The writer batches rows to reduce small-file pressure and only commits a partition once the batch size threshold has been reached.
