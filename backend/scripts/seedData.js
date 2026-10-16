function cents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected a finite money value, received ${value}`);
  }
  return Math.round(value * 100);
}

export function validateSeedData(dataset) {
  if (!dataset || !Array.isArray(dataset.authors) || dataset.authors.length === 0) {
    throw new Error('Seed data must contain at least one author');
  }

  const authorCodes = new Set();
  const emails = new Set();
  const bookCodes = new Set();
  let bookCount = 0;

  for (const author of dataset.authors) {
    if (!author.author_id || !author.name || !author.email || !Array.isArray(author.books)) {
      throw new Error('Every author must have an ID, name, email, and books array');
    }
    const email = author.email.trim().toLowerCase();
    if (authorCodes.has(author.author_id)) throw new Error(`Duplicate author ID: ${author.author_id}`);
    if (emails.has(email)) throw new Error(`Duplicate author email: ${email}`);
    authorCodes.add(author.author_id);
    emails.add(email);

    for (const book of author.books) {
      if (!book.book_id || !book.title || !book.status) {
        throw new Error(`Book under ${author.author_id} is missing its ID, title, or status`);
      }
      if (bookCodes.has(book.book_id)) throw new Error(`Duplicate book ID: ${book.book_id}`);
      bookCodes.add(book.book_id);
      bookCount += 1;

      const earned = cents(book.total_royalty_earned);
      const paid = cents(book.royalty_paid);
      const pending = cents(book.royalty_pending);
      if (paid > earned || earned - paid !== pending) {
        throw new Error(
          `${book.book_id}: royalty_pending must equal total_royalty_earned minus royalty_paid`,
        );
      }

      const copies = book.total_copies_sold;
      if (!Number.isInteger(copies) || copies < 0) {
        throw new Error(`${book.book_id}: total_copies_sold must be a non-negative integer`);
      }
      if (book.author_royalty_per_copy === null) {
        if (copies !== 0 || earned !== 0 || paid !== 0 || pending !== 0) {
          throw new Error(`${book.book_id}: a book without a per-copy royalty must have zero royalty totals`);
        }
      } else if (cents(copies * book.author_royalty_per_copy) !== earned) {
        throw new Error(
          `${book.book_id}: copies sold multiplied by royalty per copy does not equal royalty earned`,
        );
      }

      if (!Array.isArray(book.available_on)) {
        throw new Error(`${book.book_id}: available_on must be an array`);
      }
    }
  }

  return { authorCount: authorCodes.size, bookCount };
}
