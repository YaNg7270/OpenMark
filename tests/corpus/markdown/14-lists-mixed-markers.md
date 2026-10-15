# Mixed Parent And Child Markers

An ordered list may contain an unordered sublist, and the sublist keeps its own marker.

1. Gather the raw measurements from every node in the cluster.
   - record the timestamp of each sample
   - note the sampling interval per host
2. Aggregate the samples into a single time series.
3. Publish the series to the operations dashboard.

An unordered list may contain an ordered sublist just as easily.

- Deployment checklist
  1. freeze the release branch
  2. run the smoke tests
  3. tag the final artefact
- Post-deployment checklist
  1. watch the error rate for one hour
  2. confirm the rollback path still works
