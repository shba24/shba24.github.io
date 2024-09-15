+++
Description = "Part 1 of Distributed Table Format Series for Apache Iceberg where we deep dive into its internals"
Tags = ["Data Anlytics", "Apache Iceberg", "Table Format", "Data Lake", "Apache Hive"]
menu = "main"
title = "Distributed Table Format Series - Apache Iceberg - Part 1"
date = 2024-09-02T03:59:44-07:00
series = "Distributed Table Format"
draft = false
+++

## Introduction

So, after a couple of years of debating whether to jump into the icy waters of **Apache Iceberg Table** format, I finally mustered up the courage (and the free time, thanks to a long weekend) to dive into understanding it. Spoiler alert: I didn’t freeze—well, maybe just a little, but it was worth it.

In this post, I’m going to tackle some burning questions that have been floating around my head

> *How does the Apache Iceberg Table format internally work?*
>
> *How does Apache Iceberg Table fit into the huge world of data analytics?*
>
> *What benefits does Apache Iceberg provide?*

Before we dive into it, I want to provide the motivation behind writing this post. Recently, I stumbled upon the brilliant blog series by [*Jack Vanlightly*](https://jack-vanlightly.com/), dissecting the *Apache Iceberg Table consistency model* (if you haven’t read it, go check out [part 1](https://jack-vanlightly.com/analyses/2024/7/30/understanding-apache-icebergs-consistency-model-part1), [part 2](https://jack-vanlightly.com/analyses/2024/8/5/apache-icebergs-consistency-model-part-2), [part 3](https://jack-vanlightly.com/analyses/2024/8/6/apache-icebergs-consistency-model-part-3)). Jack has basically written the perfect blog series explaining the format, please go ahead and give it a read. In this post, I will try to bring something unique to the table and try to explain the puzzle as I look at it.

**Note:** For this post, all the testing is done with the stack of *Amazon Athena engine*, *Parquet file format*, *Amazon S3*, and *AWS Glue DataCatalog*.

## Glossary

* **Data Lake -** A Data Lake[18] is a centralized repository that allows you to store all your structured (like databases), semi-structured (like [*Parquet*](https://parquet.apache.org/), [*ORC*](https://cwiki.apache.org/confluence/pages/viewpage.action?pageId=31818911), or [*Avro*](https://avro.apache.org/)), and unstructured data (like emails, documents, and images) at any scale. The important thing to note here, you can store your data as-is, without having to structure it first, and run different types of analytics - from dashboards and visualizations to big data processing, real-time analytics, and machine learning - to guide better decisions.

![Fig: General Data Lake Stack Layers](/images/blog-iceberg-part-1/DataLake_Stack_Part1.png#small)

* **Data Warehouse -** A Data Warehouse[19] is a specialized type of database designed for the efficient storage, retrieval, and analysis of large volumes of structured data. It serves as a central repository where data from various sources is consolidated, transformed, and made available for complex queries and reporting.
* **Data Lake vs Data Warehouse -** While a Data Lake stores raw data, a Data Warehouse stores processed, refined data that is typically organized into tables and optimized for querying and reporting. Data Warehouses are structured and schema-based, whereas Data Lakes are more flexible, allowing for the storage of unstructured data.
* **Table Format -** A table format defines how data is organized and stored within a table, specifying the structure, schema, and relationships of the data. It is fundamental in relational databases, data warehouses, and big data systems, enabling efficient data management, querying, and analysis.

## Hive Table Format

Before Apache Iceberg came into the picture, the most commonly used table format was the *Hive Table Format* through the Apache Hive[5] SQL engine. Apache Hive[5] was originally built to translate SQL statements into Hadoop MapReduce jobs which are used to perform some operations on table data stored on object storage like HDFS, S3, Azure Blob Storage, and others.

Here is what the structure of the Hive table format used to look like
![Fig: Represents generic Hive Table format directory structure with multi-layer partitions](/images/blog-iceberg-part-1/HiveTableFormat-Part1.png#large)
Hive Table format came into the picture to remove the necessity to provide a data file path (e.g. */usr/hive/warehouse/db/table/data=2024-01-01/country=US/file1*) on which a particular Hive SQL query is used to do the processing. Instead, Apache Hive[5] talks to Apache Hive Metastore[6] to find the specific files corresponding to a table and partition(if specified) and do the MapReduce operation on those files.

### Benefits

1. Worked with every engine as Hive Table Format was a default table format for Data Lake for a long time because of its **easy pluggability** with existing data storage.  
2. **Partitioning** the data provided an efficient access pattern instead of scanning all the data to find the relevant data.  
3. **File format agnostic**. Different file formats can be used for more performance of certain types of query.  
4. Atomically update a whole partition by swapping the new partition with the old partition. **Atomicity** comes from filesystem atomicity.

But, over time as more requirements came, Hive Table Format became highly inefficient for certain types of query or data, although many of these are solved in the current version of Apache Hive[5]

### Drawbacks

1. Small updates were very **inefficient** as the whole partition folder had to be rewritten with the new data.  
2. Multi-partition change was **not safe** as Hive only supported ACID transactions at the partition level, not across multiple partitions so in case of failures, it used to create an inconsistent view of the partition.  
3. Multiple queries could modify the same data in parallel, overwriting each other's data and causing **durability/isolation issues**.  
4. Listing all the files in a partition takes a huge amount of time as the `ListFiles` operation was **not efficient** for a large set of files.  
5. Users had to know how the data was partitioned or layed out to make a query. **Partition filter was required for all queries**.
6. Hive Metastore[6] stores statistics of a table, to make the query execution efficient, but most of the time these **statistics are stale** as they are created in the background asynchronously.  
7. **Changing the partitioning schema of data was costly** as the whole data across multiple partitions had to be re-written and was not safe because of missing multi-partition ACID transactions support in Hive.

So, there was a need for a new table format which resolves these issues.

## Apache Iceberg

Apache Iceberg was released on `Dec 18, 2017` [7] by [*Ryan Blue*](https://www.linkedin.com/in/rdblue) & [*Daniel Weeks*](https://www.linkedin.com/in/daniel-weeks-a1946860/) when they built it at Netflix. Hive was used by many different services and engines in the Netflix infrastructure. However, Hive was never able to guarantee the correctness of the data and didn’t provide stable atomic transactions.

Apache Iceberg was created majorly to solve the following requirements from a Table Format for Data Lake:-

1. Ensure the **correctness** of the table data and support **ACID transactions** basically at the table level.  
2. **Performance improvements** for the small writes with support for file level changes instead of only at the partition level.  
3. **Simplify and abstract** away how the data is physically laid out on the file system, so the user doesn’t have to know about how the data is partitioned.  
4. Support quick and performant **schema evolution** of the table. Including **partition schema change** and **table schema change**.

So what *Ryan* and *Daniel* did was very intelligent. Instead of forcing an implementation like Apache Hive did and making the system strongly coupled between **Hadoop**, **Apache Hive Engine**, **Hive Table Format** and **Hive Metastore**, `Apache Iceberg dismantled what Data Lake table format consists` of and provided the following:-

1. Table format **specification** [9]  
2. **APIs** [10] and **Libraries** [11],[12] for interacting with that specification  
   - These libraries are leveraged in other engines and tools that allow them to interact with Iceberg Tables.

Because of this very important decision, Apache Iceberg started a standard for **Open Table Format (OTF)** where if any Data Lake solution supports Iceberg Tables, that Data Lake solution can be plugged with any engine that has an integration with *Iceberg APIs*. Removing the requirement to transform the data or its metadata between different table formats, so the same table data can be used across different iceberg-compatible engines, reducing the huge cost of *transformation*, *storage*, and *time*. Also, providing flexibility in using different engines for different uses, for example, a customer can use the same Iceberg table with Amazon EMR\[20\] for training their machine learning algorithm as well as Amazon Athena\[2\] for data visualization in Amazon Quicksight\[21\].

For this blog, we will focus only on the V2 spec of Apache Iceberg as it also has the support for the V1 spec.

## Apache Iceberg Table (v2) Format

Apache Iceberg table format is designed to manage a **large**, **slow-changing** collection of files in a distributed file system. Here are the major goals it's trying to hit:-

1. **Serializable Isolation** – Reads will be isolated from concurrent writes and always use a committed snapshot of a table’s data. Writes will support removing and adding files in a single operation and are never partially visible. Readers will not acquire locks.  
2. **Speed** – Operations will use *O(1)* remote calls to plan the files for a scan and not *O(n)* where n grows with the size of the table, like the number of partitions or files.  
3. **Scale –** Job planning will be handled primarily by clients (engines) and will not be a bottleneck on a central metadata store. Metadata will include information needed for cost-based optimization.  
4. **Evolution** – Tables will support full schema and partition spec evolution. Schema evolution supports safe column add, drop, reorder, and rename, including in nested structures.  
5. **Dependable types** – Tables will provide well-defined and dependable support for a core set of types.  
6. **Storage separation** – Partitioning will be table configuration. Reads will be planned using predicates on data values, not partition values. Tables will support evolving partition schemes.  
7. **Formats** – Underlying data file formats will support identical schema evolution rules and types. Both read-optimized and write-optimized formats will be available.

Apache Iceberg support matrix for different layers in the data lake stack

1. **File Format Support:** Parquet, ORC, AVRO, JSON/CSV (not recommended)  
2. **Storage Layer Support:** HDFS, S3, GCS, Azure Blob Storage, Azure Data Lake Storage, On-Premise, Local filesystem, Storage APIs (custom storage)  
3. **Catalog Support:** Hive Metastore, Hadoop, AWS Glue, Nessie, IRC (custom catalogs)  
4. **Engine Support:** Athena, EMR, Dremio, etc.

![Fig: Generic Apache Iceberg Specification Layout](/images/blog-iceberg-part-1/Iceberg_Base_Table_Spec_Part1.png#large)

For every transaction in the table, a new metadata file (`metadata file v2`) is created which basically represents the state of the table after the transaction is finished. The major difference the Apache Iceberg Table format brings as compared to the Hive Table format is *tracking of files in a table through metadata files as compared to directories*. This helps majorly with supporting **ACID transactions** on the table, which I will explain later in the post, but in short, this allows writers to create data files, manifest files, and metadata files in place and only adds to the table in an explicit atomic swap commit to the catalog where `db.table` starts pointing to the new metadata files.

### Metadata File

The table metadata file tracks the table schema, partitioning config, custom properties, and snapshots of the table contents. A snapshot represents the state of a table at some time and is used to access the complete set of data files in the table.

Metadata files server majorly following purpose in Apache Iceberg Table format:

1. **Centralized Table Information**: It serves as the authoritative source for all metadata associated with an Iceberg table, encompassing schema definitions, partitioning strategies, and snapshot history. This centralized management simplifies how data engines access and interact with the table.  
2. **Schema Evolution:** Iceberg tables can evolve over time, allowing new columns to be added, and removed or existing ones to be modified. The metadata.json file keeps track of these changes, ensuring that historical data stays accessible and queries can be run against any version of the table's history.  
3. **Data Partitioning and Organization**: The metadata.json file defines how data is partitioned, playing a key role in optimizing storage and query performance. It also tracks updates to partitioning strategies.  
4. **Sort Order Evolution**: The metadata.json file defines how data is sorted in the data files, playing a key role in optimizing storage and query performance. It also tracks updates to sort order.  
5. **Snapshot Management**: Iceberg supports snapshots, which capture different versions of the table at various points in time. The metadata file tracks these snapshots, allowing for time travel queries that let users access and query the table as it existed in the past.

{{< highlight json >}}
{
  // Represents Iceberg Spec Version
  "format-version" : 2,

  // Unique Table Id
  "table-uuid" : "aa39ff75-1fff-4130-a732-4306e7a79242",

  // Default location of the table
  "location" : "s3://athena-iceberg-test-csbansal/amazon_reviews_partitioned_iceberg",

  // ??
  "last-sequence-number" : 1,
  "last-updated-ms" : 1725209795556,
  "last-column-id" : 16,

  // Represents the current scheme-id of the table, referring to the
  // scheme-ids present in the `schemas` array below.
  "current-schema-id" : 0,

  // Represents all the schemes with scheme-id starting from 0
  "schemas" : [ {
    "type" : "struct",
    "schema-id" : 0,
    "fields" : [ {
      "id" : 1,
      "name" : "marketplace",
      "required" : false,
      "type" : "string"
    }, ... ]
  } ],

  // Represents the current spec-id of the table, referring to the
  // spec-ids present in `partition-specs` array below.
  "default-spec-id" : 0,

  // Represents all the partition specs with spec-id starting for 0
  "partition-specs" : [ {
    "spec-id" : 0,
    "fields" : [ {
      "name" : "region",
      "transform" : "identity",
      "source-id" : 16,
      "field-id" : 1000
    } ]
  } ],

  // ??
  "last-partition-id" : 1000,

  // Represents the current sort order-id of the table, referring to the
  // order-ids present in `sort-orders` array below.
  "default-sort-order-id" : 0,

  // Represents all the sort orders with order-id starting for 0
  "sort-orders" : [ {
    "order-id" : 0,
    "fields" : [ ]
  } ],

  // All the table properties passing during the creation of
  // the table from the Athena console.
  "properties" : {
    // This represents the maximum file size of each data file
    "write.target-file-size-bytes" : "536870912",

    // This represents the file format of the data files
    "write.format.default" : "parquet",

    // As the data is stored in S3, this is marked as true
    "write.object-storage.enabled" : "true",

    // This represents the path of the data files folder
    "write.object-storage.path" : "s3://athena-iceberg-test-csbansal/amazon_reviews_partitioned_iceberg/data",
    "write.parquet.compression-codec" : "zstd"
  },

  // This represents the current snapshot id of the table, referring
  // to the snapshot-id present in `snapshot` array below 
  // Just after the creation of the table, without any data committed
  // and no data files, snapshot id is marked as -1
  "current-snapshot-id" : 3309457910536306846,
  "refs" : {
    "main" : {
      "snapshot-id" : 3309457910536306846,
      "type" : "branch"
    }
  },

  // Represents the list of all snapshots with snapshot-id
  "snapshots" : [ {
    "sequence-number" : 1,
    "snapshot-id" : 3309457910536306846,
    "timestamp-ms" : 1725209795556,
    "summary" : {
      "operation" : "append",
      "trino_query_id" : "20240901_165630_00018_zy64f",
      "added-data-files" : "2",
      "added-records" : "600000",
      "added-files-size" : "26196599",
      "changed-partition-count" : "2",
      "total-records" : "600000",
      "total-files-size" : "26196599",
      "total-data-files" : "2",
      "total-delete-files" : "0",
      "total-position-deletes" : "0",
      "total-equality-deletes" : "0"
    },
    "manifest-list" : "s3://athena-iceberg-test-csbansal/amazon_reviews_partitioned_iceberg/metadata/snap-3309457910536306846-1-18e32bf4-b518-4ad4-a98c-a4608f4a0352.avro",
    "schema-id" : 0
  } ],

  // Maintains statistics about the table
  "statistics" : [ ],

  // Records changes in the current snapshot.
  // Useful for auditing, tracing table evolution, and/or rollback.
  "snapshot-log" : [ {
    "timestamp-ms" : 1725209795556,
    "snapshot-id" : 3309457910536306846
  } ],

  // Records changes in the metadata files.
  // Useful for auditing, tracing table evolution, and/or rollback.
  "metadata-log" : [ {
    "timestamp-ms" : 1725209734625,
    "metadata-file" : "s3://athena-iceberg-test-csbansal/amazon_reviews_partitioned_iceberg/metadata/00000-2daaf519-baa9-488e-b62a-dca0ff275c56.metadata.json"
  } ]
}
{{</highlight >}}

| Field | Values |
| :---: | :---: |
| `format-version` | Represents Iceberg spec version, if the engine sees a version higher than it supports, it should throw an exception to avoid data corruption. |
| `table-uuid` | Unique Table Id |
| `location` | The default location of the table, where metadata files, manifest files, and data files are stored. |
| `last-sequence-number` | The table's highest assigned sequence number, a monotonically increasing long that tracks the order of snapshots in a table. |
| `current-schema-id` | Represents the current `scheme-id` of the table, referring to the scheme-ids present in the `schemas` array below |
| `schemas` | Represents all the schema objects with unique `scheme-id` starting from 0 |
| `default-spec-id` | Represents the current spec-id of the table, referring to the spec-ids present in the `partition-specs` array below. |
| `partition-specs` | Represents all the partition specs with unique `spec-id` starting for 0 |
| `field-id` | Used to identify a partition field and is unique across all partition specs. |
| `last-partition-id` | An integer; the highest assigned partition field ID across all partition specs for the table. This is used to ensure partition fields are always assigned an unused ID when evolving specs. |
| `default-sort-order-id` | Represents the current sort `order-id` of the table, referring to the order-ids present in the `sort-orders` array below. |
| `sort-orders` | Represents all the sort orders with `order-id` starting for 0 |
| `current-snapshot-id` | This represents the current snapshot ID of the table, referring to the `snapshot-id` present in the `snapshot` array below. Just after the creation of the table, without any data committed and no data files, the snapshot id is marked as `-1` |
| `snapshots` | Represents the list of all snapshots with `snapshot-id` |
| `statistics` | Maintains statistics about the table |
| `snapshot-log` | Records change in the current snapshot. Useful for auditing, tracing table evolution, and/or rollback. |
| `metadata-log` | Records change in the metadata files. Useful for auditing, tracing table evolution, and/or rollback. |

### Manifest List

A snapshot represents the state of a table at some time and is used to access the complete set of data files in the table. Each snapshot has a manifest list which lists all the manifest files for that snapshot.  The data in a snapshot is the union of all files in its manifest files. Each manifest list stores metadata about manifests, including partition stats and data file counts. These stats are used to avoid reading manifests that are not required for an operation.

{{< highlight json >}}
{
  "data": [
    {
      "manifest_path": "s3://athena-iceberg-test-csbansal/amazon_reviews_partitioned_iceberg/metadata/18e32bf4-b518-4ad4-a98c-a4608f4a0352-m0.avro",
      "manifest_length": 8291,
      "partition_spec_id": 0,
      "content": 0,
      "sequence_number": 1,
      "min_sequence_number": 1,
      "added_snapshot_id": 3309457910536306846,
      "added_data_files_count": 2,
      "existing_data_files_count": 0,
      "deleted_data_files_count": 0,
      "added_rows_count": 600000,
      "existing_rows_count": 0,
      "deleted_rows_count": 0,
      "partitions": [
        {
          "contains_null": false,
          "contains_nan": false,
          "lower_bound": "dXMtZWFzdC0x",
          "upper_bound": "dXMtd2VzdC0y"
        }
      ]
    }
  ]
}
{{</highlight >}}

| Field | Values |
| ----- | :---: |
| `manifest_path` | Points to the manifest file path |
| `partition_spec_id` | Id of the partition spec for this manifest file |
| `sequence_number` | Represent the sequence number when this manifest file was added |
| `min_sequence_number` | The minimum data sequence number of all live data or delete files in the manifest |
| `added_snapshot_id` | Represents the snapshot ID when this manifest file was added |
| `partitions` | Represents partition stats about the data file for the query processing |

### Manifest File

Data files in snapshots are tracked by one or more manifest files that contain a row for each data file in the table, the file's partition data, and its metrics. Manifest files are reused across snapshots to avoid rewriting metadata that is slow-changing. Manifests can track data files with any subset of a table and are not associated with partitions. So, even after partition change, there is no need to change the data files, all it needs is changing the metadata, we will discuss this further in the `Schema Evolution` section below.

{{< highlight json >}}
{
  "data": [
    {
      "status": 1,
      "snapshot_id": 3309457910536306846,
      "sequence_number": null,
      "file_sequence_number": null,
      "data_file": {
        "content": 0,
        "file_path": "s3://athena-iceberg-test-csbansal/amazon_reviews_partitioned_iceberg/data/ztoQ1A/region=us-east-1/20240901_165630_00018_zy64f-4a50ddf4-9596-41cb-8d68-7b2b40b0b549.parquet",
        "file_format": "PARQUET",
        "partition": {
          "region": "us-east-1"
        },
        "record_count": 300000,
        "file_size_in_bytes": 13097723,
        "column_sizes": [
          {
            "key": 1,
            "value": 22002
          }, ... 
        ],
        "value_counts": [
          {
            "key": 1,
            "value": 300000
          }, ...
        ],
        "null_value_counts": [
          {
            "key": 1,
            "value": 0
          }, ...
        ],
        "nan_value_counts": [],
        "lower_bounds": [
          {
            "key": 1,
            "value": "SlA="
          }, ...
        ],
        "upper_bounds": [
          {
            "key": 1,
            "value": "dW5kZWZpbmVk"
          }, ...
        ],
        "key_metadata": null,
        "split_offsets": null,
        "equality_ids": null,
        "sort_order_id": 0
      }
    }, ...
  ]
}
{{</highlight>}}

| Field | Values |
| :---: | :---: |
| `snapshot_id` | Represents the snapshot id when this data file was added |
| `sequence_number` | Data sequence number of the file. |
| `file_sequence_number` | File sequence number indicating when the file was added. |
| `file_path` | Points to the data file |
| `upper_bounds` | Lists the upper bound corresponding to each column. |
| `lower_bounds` | Lists the lower bound corresponding to each column. |
| `null_value_counts` | Lists the count of null values corresponding to each column. |
| `value_counts` | Lists the total count of values corresponding to each column. |
| `column_sizes` | Lists the size of values corresponding to each column. |

### Data File

Data file formats are configurable through engines and can be set when creating a table with `CREATE TABLE` as table properties or afterwards using `ALTER TABLE` command. 

## Apache Iceberg Benefits

### Snapshot Isolation For ACID Transactions

As I mentioned above, Netflix saw a huge problem with multiple team’s **concurrent operations conflicting** with each other leading to issues with correctness of the data, making each operation unstable. One of the ways to solve this problem was to add support for **ACID transactions** in Table Format. With ACID transactions, we had the guarantee that operations will not conflict with each other causing **durability or consistency issues**.

To provide the ACID transactions support, Apache Iceberg went with **Optimistic Concurrency protocol**[22]. An atomic swap of one table metadata file for another provides the basis for serializable isolation. Readers use the snapshot that was current when they load the table metadata and are not affected by changes until they do metadata refresh and pick up a new metadata location.

#### Read - Write Isolation

![Figure 1](/images/blog-iceberg-part-1/Isolation_Read_Write_Part1.png#large)
*Figure 1: `User 1` sees the `db.table` state as `Metadata file v1` and uses the snapshot `s0`*  
![Figure 2](/images/blog-iceberg-part-1/Isolation_Read_Wrote_Part2.png#large)  
*Figure 2: `User 2` sees the `db.table` state as `Metadata file v2` and tries to commit against the snapshot `s1` which is completely isolated from `s0` used in the `Read` operation above*

Both operations above succeed without conflicting with each other but with a different view of the table, depending on when the operation started.

#### Write - Write Isolation

Writers create the changes in a *bottom-up manner*, starting with writing a new data file, then creating a new manifest file, then a new manifest file list, and then at last metadata file, optimistically, assuming the current version will not be changed before the writer’s commit to catalog. Once a writer has created an update, it commits by swapping the table’s metadata file pointer from the base version to the new version. But, if the snapshot on which the update is based is no longer the latest snapshot at the time of commit/swap operation, then the writer will have to retry the operation again against the latest snapshot. Now, at this point, there are two types of changes that the writer has already done

1. **Data changes**
2. **Metadata changes**

For some operations[[16](https://iceberg.apache.org/spec/#commit-conflict-resolution-and-retry)], there is retry support by re-applying just the metadata changes[2] against the new snapshot metadata and committing, under well-defined conditions. For example, if a file that was rewritten is still present in the new snapshot then the same rewritten file can be used against the new snapshot, without rewriting the whole file again, basically, Apache Iceberg re-uses new rewritten files if it can.

![Figure 1](/images/blog-iceberg-part-1/Write_Write_Isolation_Part1.png#large)  
*Figure 1: Initially, both users will try to do the `Get` operation to get the current table state which is `Metadata file v2,` and use that to do further write operations against*

![Figure 2](/images/blog-iceberg-part-1/Write_Write_Isolation_Part2.png#large)  
*Figure 2: In the second stage, both users try to write files in a bottom-up manner in parallel against the `Metadata file v2` creating `Metadata file v3’` and `Metadata file v3’’`* 

![Figure 3](/images/blog-iceberg-part-1/Write_Write_Isolation_Part3.png#large) 
*Figure 3: In the final stage, during the commit operation of swap (CAS\[23\]) only one user will see success, here that is `User 1` and `User 2` will retry against the latest metadata file, i.e. `Metadata file v3’`* *and might reuse the re-written files*

### Partition Evolution

**Note:** `Amazon Athena` at this moment (10/1/2024) doesn’t support altering the table partition schema[[15](https://docs.aws.amazon.com/athena/latest/ug/querying-iceberg-additional-operations.html\#querying-iceberg-additional-operations-partition-related-operations)].

Data files are stored in manifests with a tuple of partition values that are used in scans to filter out files that cannot contain records that match the scan’s filter predicate. Partition values for a data file must be the same for all records stored in the data file. Manifest file stores data files from any partition as long as the partition spec is the same for all the data files in that manifest, so the **partition abstraction is maintained at each manifest file level**.

Partitioning can change and the correct partition filters are always derived from column predicates, which makes it **defined and predictable** for each row.

Apache Iceberg supports partition evolution which works at scale and maintains the **correctness** of the table at all times, which, if you remember, was missing from the Hive Table format. Table partitioning can be evolved by adding, removing, renaming, or reordering partition spec fields.

Changing a partition spec produces a new spec identified by a unique spec ID that is added to the table's list of partition specs and may be set as the table's default spec.

**Note:** Partition field IDs never change, it only increases even if fields are removed to make sure it's backward compatible.

![Figure 1](/images/blog-iceberg-part-1/Partition_Evolution_Part1.png#large)  
*Figure 1: At the start, we have a table state with `spec-id` \= 0, pointing to partition spec with only the `region` as the partition column. This will be used in all the query planning and execution by the engine.*

![Figure 2](/images/blog-iceberg-part-1/Partition_Evolution_Part2.png#large) 
*Figure 2: When we do the `ALTER TABLE ADD PARTITION` operation, it will alter the table partition schema/spec. With Iceberg, the change in partition schema happens at the metadata layer only, no changes to existing data files are done. The new snapshot file `Manifest List v2` will still point to the old Manifest file `Manifest file v1`*

![Figure 3](/images/blog-iceberg-part-1/Partition_Evolution_Part3.png#large)
*Figure 3: And, when we finally write to the table after partition schema evolution, the new manifest file list `Manifest List v3` and manifest file `Manifest file v2` will be created with the new partition schema metadata.*

### Delete / Update / Merge Mode

**Note:** Athena ONLY [24] supports *Merge-On-Read (MOR)* by default when changing data by using the `UPDATE`, `MERGE INTO`, and `DELETE FROM` statements.

Apache Iceberg supports two ways of handling row-level updates/delete/merge. Each has its own pros and cons, and knowing how it works internally helps in configuring your table at the time of creation, and optimizing for the traffic pattern that you have for different scenarios.

#### Delete Files

There is no way, as of now, that lets you choose a specific Delete File type. It depends on how the `DeleteFile` Interface is implemented in the engine that is being used.

##### Positional Delete Files

Positional Delete files store the exact position of the deleted records in the dataset. It keeps track of the file path of the data file along with the position of the deleted records in that file.

##### Equality Delete Files

Equality Delete Files stores the value of one or more columns of the deleted records. These column values are stored based on the condition used while deleting these records.

Let’s say the columns for the deleted records are

{{< highlight json>}}
{
  data = "2024-09-01"
  region = "us-east-1"
}
{{</highlight>}}

When we put these column values in the equality delete file, it will work as deleting all the rows with these column values, and that could be 1000 rows as well. So, adding just a single line in an equality delete file could cause many rows to be deleted in the table.

#### Copy-On-Write (COW)

In this approach, existing data files are re-written on `UPDATE`, `MERGE INTO`, and `DELETE FROM` statements. It just completely rewrittes the data files and the new snapshot starts pointing to that new data file and doesn't point to the old one.

#### Merge-On-Read (MOR)

In this approach, existing data files are not re-written on `UPDATE`, `MERGE INTO`, and `DELETE FROM` statements, but one or more delete files are created containing the rows either deleted/updated/merged.

##### DELETE

![Figure 1](/images/blog-iceberg-part-1/Delete_MOR_Part1.png#large)
*Figure 1: For a `DELETE` operation, a new snapshot is created, pointing to a new manifest list `Manifest List v2`. That manifest list is pointing to a new Manifest file `Manifest file v2` which ultimately points to a delete file. In the above figure, the format of the delete file is `Positional Delete File`*

Below is the `Manifest List v2`. A new snapshot `6348593007041601180` was added corresponding to a new delete file `c2f70e20-0e4f-4d52-b600-17c264357ff4-m0.avro`.

{{<highlight json>}}
{
  "data": [
    {
      "manifest_path": "s3://athena-iceberg-test-csbansal/amazon_reviews_partitioned_iceberg/metadata/c2f70e20-0e4f-4d52-b600-17c264357ff4-m0.avro",
      …
      "sequence_number": 2,
      "min_sequence_number": 2,
      "added_snapshot_id": 6348593007041601180,
      "added_data_files_count": 1,
      "added_rows_count": 1,
      …
    },
    {...}
  ]
}
{{</highlight>}}

##### UPDATE

![Figure 1](/images/blog-iceberg-part-1/Update_MOR.png#large) 
*Figure 1: For an `UPDATE` operation, a new snapshot is created, pointing to a new manifest list `Manifest List v2`. That manifest list is pointing to two new Manifest files `Manifest file v2` and `Manifest file v3` which ultimately point to a delete file and a data file respectively. In the above figure, the format of the delete file is the `Positional Delete File.`*

Below is the `Manifest List v2`. A new snapshot `6348593007041601180` was added corresponding to a new data file `c2f70e20-0e4f-4d52-b600-17c264357ff4-m0.avro` and a new delete file `c2f70e20-0e4f-4d52-b600-17c264357ff4-m1.avro`. Notice that both these manifest files correspond to the same snapshot, added in the same transaction sequence number. 

> How do we define the order among delete and data files in the same transaction?

**THUMB RULE.** Always read manifest files in order, i.e. `m0` and then `m1`. New data files are always preceded in reads compared to delete files from a single transaction.

{{<highlight json>}}
{
  "data": [
    {
      "manifest_path": "s3://athena-iceberg-test-csbansal/amazon_reviews_partitioned_iceberg/metadata/c2f70e20-0e4f-4d52-b600-17c264357ff4-m0.avro",
      …
      "sequence_number": 2,
      "min_sequence_number": 2,
      "added_snapshot_id": 6348593007041601180,
      "added_data_files_count": 1,
      "added_rows_count": 1,
      …
    },
    {...},
    {
      "manifest_path": "s3://athena-iceberg-test-csbansal/amazon_reviews_partitioned_iceberg/metadata/c2f70e20-0e4f-4d52-b600-17c264357ff4-m1.avro",
      …
      "sequence_number": 2,
      "min_sequence_number": 2,
      "added_snapshot_id": 6348593007041601180,
      "added_data_files_count": 1,
      "added_rows_count": 1,
      …
    }
  ]
}
{{</highlight>}}

#### Copy-on-Write vs Merge-on-Read

From [15]

> It’s faster to read from a table if the query engine doesn’t have to read lots of files and doesn’t have to reconcile or do any additional work while reading the data.  
> It’s faster to write into a table if the query engine has to write less data.

$$ Read Latency \propto Number Of Files Read $$
$$ Read Latency \propto Processing Data $$

$$ Write Latency \propto Number Of Files Written $$
$$ Write Latency \propto Size Of Data Written $$

|  | Copy-on-Write | Merge-on-Read |
| :---: | :---: | :---: |
| Number of files read | less | more |
| Data Processing | less | more |
|  |  |  |
| Number of files touched to write | more | less |
| Size of data written to files | more | less |

Looking at the above table, Copy-on-Write seems more suitable for the `READ` heavy system as compared to the `WRITE` heavy system, and Merge-on-Read seems more suitable for `WRITE` heavy system as compared to `READ` heavy system.

### Table Metrics

Column stats are stored manifest files and updated on each transaction. In Hive table format, users had to run the metric calculation job regularly manually, which used to asynchronously update the table statistics. But the stats used to be out-of-date most of the time, causing query planning and execution to be in-efficient and unpredictable.

### Hidden Partitioning

As mentioned above, the Hive table format had multiple issues because of **strong coupling with the partitioning** of the table. Here are some of the issues:

1. A client who was using SQL to access the data lake had to know about the partitions (Hive must be given partition values) or the physical layout of the table to query the data (e.g. we couldn’t just pass the `date`, we had to pass the exact filter with `day` or `month` if partitioning was done on `day` or `month`).  
2. Hive **didn’t know the relation between different columns and partition** columns to create the partition value from other columns. So, it **couldn’t do the validation** on the partition value format and would return wrong rows if passed wrong value, instead of failing. It was the users’ responsibility for the correctness of filter values and not of table format.  
3. Queries in Apache Hive were strongly coupled with the exact table partition schema. It would be very **painful to update the partitioning of the table**. With Apache Iceberg, the user doesn’t have to know about how the table is partitioned and can update the table partitioning without updating all the existing SQL queries.

Iceberg produces partition values by taking a **column value and optionally transforming** it. Iceberg is responsible for converting column value into partition value and keeps track of the relationship. Because Iceberg **doesn't require user-maintained partition columns**, it can hide partitioning. Partition values are produced correctly every time and always used to speed up queries, when possible.

### Schema Evolution

Schemas may be evolved by type promotion or adding, deleting, renaming, or reordering fields in structs (both nested structs and the top-level schema’s struct).

Adding a new field assigns a new ID for that field and for any nested fields. Renaming an existing field must change the name, but not the field ID, that's why metadata refers to the field ID and not the field name as the field name can change but not the field ID. Deleting a field removes it from the current schema.

**Note:** Field deletion cannot be rolled back unless the field is nullable so that after rollback, the rows without the previously removed column, data for those columns will have a null value. Also, we can roll back if the current snapshot has not changed as no data has been added with the new schema.

![Figure 1](/images/blog-iceberg-part-1/Schema_Evolution_Part1.png#large)

*Figure 1: At the start, we have a table state with `current-schema-id` \= 0, pointing to schema spec with 16 columns. Each snapshot also corresponds to a specific schema spec, which was not the case with the partition spec. For schema spec, diversion happens just after the metadata file level. This will be used in all the query planning and execution by the engine.*

![Figure 2](/images/blog-iceberg-part-1/Schema_Evolution_Part2.png#large)  

*Figure 2: When we do the `ALTER TABLE ADD COLUMN` operation, it will alter the table schema spec. With Iceberg, the change in schema happens at the metadata layer only, no changes to existing data files are done. New metadata file `Metadata File v2` will still have the same snapshot as previously, pointing to the old Manifest List file `Manifest file v1`*

![Figure 3](/images/blog-iceberg-part-1/Schema_Evolution_Part3.png#large)  

*Figure 3: And, when we finally write to the table after table schema evolution, the new manifest file list `Manifest List v3` and manifest file `Manifest file v2` will be created with the new schema spec metadata.*

### Time-Travel

Apache Iceberg supports **time travel queries** on the table where users can mention the timestamp `time` and engines can execute the provided query against the table data as it existed at that timestamp `time`.  
This is only possible because the Apache Iceberg table format can store the snapshot history in its metadata files and its data files are always append-only. So, the engines can use the snapshot which represents the table state at a certain timestamp, and execute the query against the data files corresponding to that snapshot.

![Figure 1](/images/blog-iceberg-part-1/TimeTravel_Part1.png#large)  
*Figure 1: When `User 1` passes a timestamp in its `SELECT` query, the table state used would correspond to that timestamp, i.e. Snapshot 0 `s0,` and  `User 2` will see the latest table state, i.e. Snapshot `s1`. Data of a particular row corresponding to different snapshots could be different, for customer `12345`, the rating in `s0` is `1` whereas in `s1` rating is `3`.*

## Summary

In this first part of the Distributed Table Format Series, we explore the Apache Iceberg table format, a powerful tool for managing large-scale analytic datasets in a distributed environment. The post delves into the internal workings of Iceberg, its relevance in the data analytics landscape, and the benefits it provides. Through practical examples using Amazon Athena, Parquet, Amazon S3, and AWS Glue Data Catalog, we explore why Iceberg is becoming a crucial component in modern data lakes.
What we will focus on in the next parts of the Iceberg series:

1. Query Processing  
   - Planning  
   - Execution
2. Table APIs  
3. Catalog APIs  
4. Storage APIs  
5. Optimization  
   - Storage  
      - Compaction  
      - Orphan file removal  
      - Snapshot deletion
   - Query
6. View Spec  
7. Stats Spec (Puffin)

## References

1. Amazon Redshift \- [https://docs.aws.amazon.com/whitepapers/latest/big-data-analytics-options/amazon-redshift.html](https://docs.aws.amazon.com/whitepapers/latest/big-data-analytics-options/amazon-redshift.html)  
2. Amazon Athena \- [https://aws.amazon.com/athena/](https://aws.amazon.com/athena/)  
3. AWS Glue \- [https://aws.amazon.com/glue/](https://aws.amazon.com/glue/)  
4. When should I use Athena? \- [https://docs.aws.amazon.com/athena/latest/ug/when-should-i-use-ate.html](https://docs.aws.amazon.com/athena/latest/ug/when-should-i-use-ate.html)  
5. Apache Hive \- [https://hive.apache.org/](https://hive.apache.org/)  
6. Apache Hive Metastore \- [https://cwiki.apache.org/confluence/display/Hive/AdminManual+Metastore+Administration](https://cwiki.apache.org/confluence/display/Hive/AdminManual+Metastore+Administration)  
7. Original Iceberg Github Commit \- Dec 18, 2017 \- [https://github.com/apache/iceberg/commit/a5eb3f6ba171ecfc517a4f09ae9654e7d8ae0291](https://github.com/apache/iceberg/commit/a5eb3f6ba171ecfc517a4f09ae9654e7d8ae0291)  
8. Wikipedia \- Apache Iceberg  \- [https://en.wikipedia.org/wiki/Apache\_Iceberg](https://en.wikipedia.org/wiki/Apache\_Iceberg)  
9. Apache Iceberg Spec \- [https://iceberg.apache.org/spec/](https://iceberg.apache.org/spec/)  
10. Apache Iceberg API \- [https://iceberg.apache.org/docs/nightly/java-api-quickstart/](https://iceberg.apache.org/docs/nightly/java-api-quickstart/)  
11. Apache Iceberg Flink Library \- [https://iceberg.apache.org/docs/nightly/flink/](https://iceberg.apache.org/docs/nightly/flink/)  
12. Apache Iceberg Spark Library \- [https://iceberg.apache.org/docs/nightly/spark-getting-started/](https://iceberg.apache.org/docs/nightly/spark-getting-started/)  
13. Apache Iceberg Metadata file spec \- [https://medium.com/data-engineering-with-dremio/understanding-apache-icebergs-metadata-json-file-0cbbce193737](https://medium.com/data-engineering-with-dremio/understanding-apache-icebergs-metadata-json-file-0cbbce193737)  
14. Apache Iceberg Optimistic Concurrency \- [https://iceberg.apache.org/spec/\#optimistic-concurrency](https://iceberg.apache.org/spec/\#optimistic-concurrency)  
15. Amazon Athena Partition Evolution \- [https://docs.aws.amazon.com/athena/latest/ug/querying-iceberg-additional-operations.html\#querying-iceberg-additional-operations-partition-related-operations](https://docs.aws.amazon.com/athena/latest/ug/querying-iceberg-additional-operations.html\#querying-iceberg-additional-operations-partition-related-operations)  
16. Apache Iceberg \- Commit conflict resolution and retry \- [https://iceberg.apache.org/spec/\#commit-conflict-resolution-and-retry](https://iceberg.apache.org/spec/\#commit-conflict-resolution-and-retry)  
17. Apache Iceberg \- Hidden partitioning \- [https://iceberg.apache.org/docs/1.6.0/partitioning/?h=hidden\#problems-with-hive-partitioning](https://iceberg.apache.org/docs/1.6.0/partitioning/?h=hidden\#problems-with-hive-partitioning)  
18. Data Lake \- [https://aws.amazon.com/what-is/data-lake/](https://aws.amazon.com/what-is/data-lake/)  
19. Data Warehouse \- [https://aws.amazon.com/what-is/data-warehouse/](https://aws.amazon.com/what-is/data-warehouse/)  
20. Amazon EMR \- [https://aws.amazon.com/emr/](https://aws.amazon.com/emr/)  
21. Amazon Quicksight \- [https://aws.amazon.com/quicksight/](https://aws.amazon.com/quicksight/)  
22. Optimistic concurrency control \- [https://en.wikipedia.org/wiki/Optimistic\_concurrency\_control](https://en.wikipedia.org/wiki/Optimistic\_concurrency\_control)  
23. Compare-and-Swap (CAS) \- [https://en.wikipedia.org/wiki/Compare-and-swap](https://en.wikipedia.org/wiki/Compare-and-swap)  
24. Athena Merge Mode Support \- [https://docs.aws.amazon.com/prescriptive-guidance/latest/apache-iceberg-on-aws/iceberg-athena.html\#:\~:text=Athena%20supports%20merge%2Don%2Dread%20mode%20only](https://docs.aws.amazon.com/prescriptive-guidance/latest/apache-iceberg-on-aws/iceberg-athena.html\#:\~:text=Athena%20supports%20merge%2Don%2Dread%20mode%20only)  
25. Copy-on-write and Merge-on-read \- Akashdeep Gupta \- [https://medium.com/@geekfrosty/copy-on-write-or-merge-on-read-what-when-and-how-64c27061ad56](https://medium.com/@geekfrosty/copy-on-write-or-merge-on-read-what-when-and-how-64c27061ad56)