//! Minimal ZIP writer for bundling a handful of PDFs into one download.
//!
//! Entries are stored without compression (PDFs are already compressed), so the format is just
//! local headers, raw data, a central directory and the end-of-central-directory record. It is
//! deliberately limited to small archives: no ZIP64, no encryption, ASCII names.

const LOCAL_HEADER_SIGNATURE: u32 = 0x0403_4b50;
const CENTRAL_HEADER_SIGNATURE: u32 = 0x0201_4b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE: u32 = 0x0605_4b50;
// Fixed DOS timestamp (1980-01-01 00:00) keeps the archive byte-for-byte reproducible.
const DOS_TIME: u16 = 0;
const DOS_DATE: u16 = 0x0021;
const VERSION_NEEDED: u16 = 20;
const FLAG_UTF8_NAMES: u16 = 0x0800;

pub(super) const ZIP_MAX_ENTRIES: usize = 64;

fn crc32_table() -> [u32; 256] {
    let mut table = [0u32; 256];
    for (index, slot) in table.iter_mut().enumerate() {
        let mut value = index as u32;
        for _ in 0..8 {
            value = if value & 1 == 1 {
                0xEDB8_8320 ^ (value >> 1)
            } else {
                value >> 1
            };
        }
        *slot = value;
    }
    table
}

pub(super) fn crc32(data: &[u8]) -> u32 {
    let table = crc32_table();
    let mut crc = 0xFFFF_FFFFu32;
    for byte in data {
        crc = table[((crc ^ u32::from(*byte)) & 0xFF) as usize] ^ (crc >> 8);
    }
    !crc
}

/// Builds a stored (uncompressed) ZIP from `(file name, bytes)` entries.
/// Returns `None` when the archive would need ZIP64 (too many entries or more than 4 GiB).
pub(super) fn build_stored_zip(entries: &[(String, Vec<u8>)]) -> Option<Vec<u8>> {
    if entries.len() > ZIP_MAX_ENTRIES {
        return None;
    }
    let mut output: Vec<u8> = Vec::new();
    let mut central: Vec<u8> = Vec::new();
    for (name, data) in entries {
        let name_bytes = name.as_bytes();
        let name_length = u16::try_from(name_bytes.len()).ok()?;
        let size = u32::try_from(data.len()).ok()?;
        let offset = u32::try_from(output.len()).ok()?;
        let crc = crc32(data);

        output.extend_from_slice(&LOCAL_HEADER_SIGNATURE.to_le_bytes());
        output.extend_from_slice(&VERSION_NEEDED.to_le_bytes());
        output.extend_from_slice(&FLAG_UTF8_NAMES.to_le_bytes());
        output.extend_from_slice(&0u16.to_le_bytes()); // method: stored
        output.extend_from_slice(&DOS_TIME.to_le_bytes());
        output.extend_from_slice(&DOS_DATE.to_le_bytes());
        output.extend_from_slice(&crc.to_le_bytes());
        output.extend_from_slice(&size.to_le_bytes()); // compressed size
        output.extend_from_slice(&size.to_le_bytes()); // uncompressed size
        output.extend_from_slice(&name_length.to_le_bytes());
        output.extend_from_slice(&0u16.to_le_bytes()); // extra length
        output.extend_from_slice(name_bytes);
        output.extend_from_slice(data);

        central.extend_from_slice(&CENTRAL_HEADER_SIGNATURE.to_le_bytes());
        central.extend_from_slice(&VERSION_NEEDED.to_le_bytes()); // version made by
        central.extend_from_slice(&VERSION_NEEDED.to_le_bytes()); // version needed
        central.extend_from_slice(&FLAG_UTF8_NAMES.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&DOS_TIME.to_le_bytes());
        central.extend_from_slice(&DOS_DATE.to_le_bytes());
        central.extend_from_slice(&crc.to_le_bytes());
        central.extend_from_slice(&size.to_le_bytes());
        central.extend_from_slice(&size.to_le_bytes());
        central.extend_from_slice(&name_length.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes()); // extra length
        central.extend_from_slice(&0u16.to_le_bytes()); // comment length
        central.extend_from_slice(&0u16.to_le_bytes()); // disk number
        central.extend_from_slice(&0u16.to_le_bytes()); // internal attributes
        central.extend_from_slice(&0u32.to_le_bytes()); // external attributes
        central.extend_from_slice(&offset.to_le_bytes());
        central.extend_from_slice(name_bytes);
    }

    let central_offset = u32::try_from(output.len()).ok()?;
    let central_size = u32::try_from(central.len()).ok()?;
    let entry_count = u16::try_from(entries.len()).ok()?;
    output.extend_from_slice(&central);
    output.extend_from_slice(&END_OF_CENTRAL_DIRECTORY_SIGNATURE.to_le_bytes());
    output.extend_from_slice(&0u16.to_le_bytes()); // this disk
    output.extend_from_slice(&0u16.to_le_bytes()); // disk with central directory
    output.extend_from_slice(&entry_count.to_le_bytes());
    output.extend_from_slice(&entry_count.to_le_bytes());
    output.extend_from_slice(&central_size.to_le_bytes());
    output.extend_from_slice(&central_offset.to_le_bytes());
    output.extend_from_slice(&0u16.to_le_bytes()); // comment length
    u32::try_from(output.len()).ok()?;
    Some(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read_u16(bytes: &[u8], at: usize) -> u16 {
        u16::from_le_bytes([bytes[at], bytes[at + 1]])
    }
    fn read_u32(bytes: &[u8], at: usize) -> u32 {
        u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
    }

    #[test]
    fn crc32_matches_the_standard_check_value() {
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
        assert_eq!(crc32(b""), 0);
    }

    /// Walks the archive the way an unzip tool does and checks names, sizes, CRCs and data.
    #[test]
    fn archive_round_trips_through_its_central_directory() {
        let entries = vec![
            ("cv.pdf".to_owned(), b"%PDF-1.7\nfirst".to_vec()),
            ("cover-letter.pdf".to_owned(), Vec::new()),
            ("supporting-document-9.pdf".to_owned(), vec![0u8, 255, 7, 42]),
        ];
        let zip = build_stored_zip(&entries).unwrap();
        // Lets a human run a real unzip tool against the output: ZIP_TEST_OUT=/path/archive.zip cargo test
        if let Ok(path) = std::env::var("ZIP_TEST_OUT") {
            std::fs::write(path, &zip).unwrap();
        }

        let eocd = zip.len() - 22;
        assert_eq!(read_u32(&zip, eocd), END_OF_CENTRAL_DIRECTORY_SIGNATURE);
        assert_eq!(read_u16(&zip, eocd + 8) as usize, entries.len());
        assert_eq!(read_u16(&zip, eocd + 10) as usize, entries.len());
        let central_size = read_u32(&zip, eocd + 12) as usize;
        let central_offset = read_u32(&zip, eocd + 16) as usize;
        assert_eq!(central_offset + central_size, eocd);

        let mut cursor = central_offset;
        for (name, data) in &entries {
            assert_eq!(read_u32(&zip, cursor), CENTRAL_HEADER_SIGNATURE);
            let crc = read_u32(&zip, cursor + 16);
            let compressed = read_u32(&zip, cursor + 20) as usize;
            let uncompressed = read_u32(&zip, cursor + 24) as usize;
            let name_length = read_u16(&zip, cursor + 28) as usize;
            let local_offset = read_u32(&zip, cursor + 42) as usize;
            assert_eq!(&zip[cursor + 46..cursor + 46 + name_length], name.as_bytes());
            assert_eq!(compressed, data.len());
            assert_eq!(uncompressed, data.len());
            assert_eq!(crc, crc32(data));

            assert_eq!(read_u32(&zip, local_offset), LOCAL_HEADER_SIGNATURE);
            assert_eq!(read_u16(&zip, local_offset + 26) as usize, name_length);
            let data_start = local_offset + 30 + name_length;
            assert_eq!(&zip[data_start..data_start + data.len()], data.as_slice());
            cursor += 46 + name_length;
        }
        assert_eq!(cursor, eocd);
    }

    #[test]
    fn empty_archive_is_only_the_end_record() {
        let zip = build_stored_zip(&[]).unwrap();
        assert_eq!(zip.len(), 22);
        assert_eq!(read_u32(&zip, 0), END_OF_CENTRAL_DIRECTORY_SIGNATURE);
    }

    #[test]
    fn too_many_entries_are_refused_instead_of_needing_zip64() {
        let entries = (0..=ZIP_MAX_ENTRIES)
            .map(|index| (format!("{index}.pdf"), vec![1u8]))
            .collect::<Vec<_>>();
        assert!(build_stored_zip(&entries).is_none());
    }
}
