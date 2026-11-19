export async function seed(page, name = 'North Garage') {
  await page.goto('http://localhost:5174/');
  return page.evaluate(async (n) => {
    const { createQuickLot } = await import('/src/model/quickLot.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createQuickLot(n, { floors: 3, rows: 4, spacesPerRow: 14, accessible: 2 });
    await repository.createMap(doc); await repository.publishMap(doc.id); return doc.id;
  }, name);
}
