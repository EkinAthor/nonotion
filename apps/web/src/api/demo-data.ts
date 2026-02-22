/**
 * Pre-loaded demo content with stable IDs.
 * seedDemoData() writes everything to localStorage via demo-storage.
 */
import type { Page, Block } from '@nonotion/shared';
import * as storage from './demo-storage';

const NOW = '2026-02-21T00:00:00.000Z';

// ============ DEMO USER ============
export const DEMO_USER_ID = 'usr_demo00000001';
export const DEMO_USER = {
  id: DEMO_USER_ID,
  name: 'Demo User',
  email: 'demo@nonotion.app',
  role: 'admin' as const,
  avatarUrl: null,
  googleId: null,
  approved: true,
  createdAt: NOW,
  updatedAt: NOW,
};

// ============ PAGE IDS ============
const PG_BOOKS = 'pg_demo_books01';
const PG_SHOWCASE = 'pg_demo_showcs1';
const PG_GETTING_STARTED = 'pg_demo_getstr1';

// ============ PROPERTY / OPTION IDS ============
const PROP_TITLE = 'prop_demo_title';
const PROP_AUTHOR = 'prop_demo_authr';
const PROP_GENRE = 'prop_demo_genre';
const PROP_STATUS = 'prop_demo_stats';
const PROP_RATING = 'prop_demo_ratng';
const PROP_DATE = 'prop_demo_datrd';
const PROP_RECOMMEND = 'prop_demo_recmd';
const PROP_NOTES = 'prop_demo_notes';
const PROP_LINK = 'prop_demo_linkk';

// Genre options
const OPT_FICTION = 'opt_demo_fictn1';
const OPT_NONFICTION = 'opt_demo_nonfn1';
const OPT_SCIFI = 'opt_demo_scifi1';
const OPT_FANTASY = 'opt_demo_fntsy1';
const OPT_MYSTERY = 'opt_demo_mystry';
const OPT_BIOGRAPHY = 'opt_demo_biogr1';
const OPT_SELFHELP = 'opt_demo_slfhl1';

// Status options
const OPT_TO_READ = 'opt_demo_toread';
const OPT_READING = 'opt_demo_readng';
const OPT_FINISHED = 'opt_demo_finshd';

// ============ BOOK ROW IDS ============
const ROW_IDS = [
  'pg_demo_book001',
  'pg_demo_book002',
  'pg_demo_book003',
  'pg_demo_book004',
  'pg_demo_book005',
  'pg_demo_book006',
  'pg_demo_book007',
  'pg_demo_book008',
  'pg_demo_book009',
  'pg_demo_book010',
];

// ============ SCHEMA ============
const bookSchema = {
  properties: [
    { id: PROP_TITLE, name: 'Name', type: 'title' as const, order: 0 },
    { id: PROP_AUTHOR, name: 'Author', type: 'text' as const, order: 1 },
    {
      id: PROP_GENRE,
      name: 'Genre',
      type: 'select' as const,
      order: 2,
      options: [
        { id: OPT_FICTION, name: 'Fiction', color: 'blue' as const },
        { id: OPT_NONFICTION, name: 'Non-Fiction', color: 'green' as const },
        { id: OPT_SCIFI, name: 'Sci-Fi', color: 'purple' as const },
        { id: OPT_FANTASY, name: 'Fantasy', color: 'pink' as const },
        { id: OPT_MYSTERY, name: 'Mystery', color: 'red' as const },
        { id: OPT_BIOGRAPHY, name: 'Biography', color: 'orange' as const },
        { id: OPT_SELFHELP, name: 'Self-Help', color: 'yellow' as const },
      ],
    },
    {
      id: PROP_STATUS,
      name: 'Status',
      type: 'select' as const,
      order: 3,
      options: [
        { id: OPT_TO_READ, name: 'To Read', color: 'gray' as const },
        { id: OPT_READING, name: 'Reading', color: 'blue' as const },
        { id: OPT_FINISHED, name: 'Finished', color: 'green' as const },
      ],
    },
    { id: PROP_RATING, name: 'Rating', type: 'text' as const, order: 4 },
    { id: PROP_DATE, name: 'Date Read', type: 'date' as const, order: 5 },
    { id: PROP_RECOMMEND, name: 'Recommend', type: 'checkbox' as const, order: 6 },
    { id: PROP_NOTES, name: 'Notes', type: 'text' as const, order: 7 },
    { id: PROP_LINK, name: 'Link', type: 'url' as const, order: 8 },
  ],
};

// ============ BOOK ROWS ============
interface BookData {
  title: string;
  author: string;
  genre: string;
  status: string;
  rating: string;
  date: string | null;
  recommend: boolean;
  notes: string;
  link: string;
}

const books: BookData[] = [
  { title: 'Dune', author: 'Frank Herbert', genre: OPT_SCIFI, status: OPT_FINISHED, rating: '5/5', date: '2025-08-15', recommend: true, notes: 'A masterpiece of world-building', link: 'https://en.wikipedia.org/wiki/Dune_(novel)' },
  { title: 'Project Hail Mary', author: 'Andy Weir', genre: OPT_SCIFI, status: OPT_FINISHED, rating: '5/5', date: '2025-09-02', recommend: true, notes: 'Couldn\'t put it down!', link: '' },
  { title: 'The Name of the Wind', author: 'Patrick Rothfuss', genre: OPT_FANTASY, status: OPT_FINISHED, rating: '4/5', date: '2025-07-20', recommend: true, notes: 'Beautiful prose', link: '' },
  { title: 'Atomic Habits', author: 'James Clear', genre: OPT_SELFHELP, status: OPT_FINISHED, rating: '4/5', date: '2025-10-01', recommend: true, notes: 'Practical and actionable', link: 'https://jamesclear.com/atomic-habits' },
  { title: 'The Girl with the Dragon Tattoo', author: 'Stieg Larsson', genre: OPT_MYSTERY, status: OPT_READING, rating: '', date: null, recommend: false, notes: 'Slow start but getting good', link: '' },
  { title: 'Sapiens', author: 'Yuval Noah Harari', genre: OPT_NONFICTION, status: OPT_FINISHED, rating: '4/5', date: '2025-06-10', recommend: true, notes: 'Changed how I think about history', link: '' },
  { title: 'The Hobbit', author: 'J.R.R. Tolkien', genre: OPT_FANTASY, status: OPT_FINISHED, rating: '5/5', date: '2025-03-15', recommend: true, notes: 'A timeless classic', link: '' },
  { title: 'Steve Jobs', author: 'Walter Isaacson', genre: OPT_BIOGRAPHY, status: OPT_TO_READ, rating: '', date: null, recommend: false, notes: '', link: '' },
  { title: 'Neuromancer', author: 'William Gibson', genre: OPT_SCIFI, status: OPT_TO_READ, rating: '', date: null, recommend: false, notes: 'Recommended by a friend', link: '' },
  { title: 'Gone Girl', author: 'Gillian Flynn', genre: OPT_FICTION, status: OPT_FINISHED, rating: '3/5', date: '2025-11-20', recommend: false, notes: 'Twisty plot but didn\'t love the ending', link: '' },
];

function makeBookRow(idx: number, book: BookData): Page {
  return {
    id: ROW_IDS[idx],
    title: book.title,
    type: 'document',
    ownerId: DEMO_USER_ID,
    parentId: PG_BOOKS,
    childIds: [],
    icon: null,
    isStarred: false,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    properties: {
      [PROP_TITLE]: { type: 'title', value: book.title },
      [PROP_AUTHOR]: { type: 'text', value: book.author },
      [PROP_GENRE]: { type: 'select', value: book.genre },
      [PROP_STATUS]: { type: 'select', value: book.status },
      [PROP_RATING]: { type: 'text', value: book.rating },
      [PROP_DATE]: { type: 'date', value: book.date },
      [PROP_RECOMMEND]: { type: 'checkbox', value: book.recommend },
      [PROP_NOTES]: { type: 'text', value: book.notes },
      [PROP_LINK]: { type: 'url', value: book.link },
    },
  };
}

// ============ PAGES ============

function createPages(): Page[] {
  const bookRows = books.map((b, i) => makeBookRow(i, b));

  const databasePage: Page = {
    id: PG_BOOKS,
    title: 'My Book Database',
    type: 'database',
    ownerId: DEMO_USER_ID,
    parentId: null,
    childIds: ROW_IDS,
    icon: '\uD83D\uDCDA',
    isStarred: false,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    databaseSchema: bookSchema,
  };

  const showcasePage: Page = {
    id: PG_SHOWCASE,
    title: 'Formatting Showcase',
    type: 'document',
    ownerId: DEMO_USER_ID,
    parentId: null,
    childIds: [PG_GETTING_STARTED],
    icon: '\u2728',
    isStarred: true,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  };

  const gettingStartedPage: Page = {
    id: PG_GETTING_STARTED,
    title: 'Getting Started',
    type: 'document',
    ownerId: DEMO_USER_ID,
    parentId: PG_SHOWCASE,
    childIds: [],
    icon: '\uD83D\uDE80',
    isStarred: false,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  };

  return [databasePage, showcasePage, gettingStartedPage, ...bookRows];
}

// ============ BLOCKS ============

let blockOrder = 0;

function blk(id: string, pageId: string, type: Block['type'], content: Block['content']): Block {
  return { id, type, pageId, order: blockOrder++, content, version: 1 };
}

function createShowcaseBlocks(): Block[] {
  blockOrder = 0;
  return [
    blk('blk_demo_h1_001', PG_SHOWCASE, 'heading', { text: 'Welcome to Nonotion', level: 1 }),
    blk('blk_demo_p1_001', PG_SHOWCASE, 'paragraph', { text: 'This page demonstrates all the <strong>block types</strong> and <em>formatting options</em> available in Nonotion.' }),
    blk('blk_demo_dv_001', PG_SHOWCASE, 'divider', {}),

    blk('blk_demo_h2_001', PG_SHOWCASE, 'heading2', { text: 'Headings', level: 2 }),
    blk('blk_demo_h3_001', PG_SHOWCASE, 'heading3', { text: 'This is a Heading 3', level: 3 }),
    blk('blk_demo_p2_001', PG_SHOWCASE, 'paragraph', { text: 'Regular paragraph text. You can use <strong>bold</strong>, <em>italic</em>, <code>inline code</code>, and <a href="https://github.com">links</a>.' }),

    blk('blk_demo_h2_002', PG_SHOWCASE, 'heading2', { text: 'Lists', level: 2 }),
    blk('blk_demo_bl_001', PG_SHOWCASE, 'bullet_list', { text: 'First bullet point' }),
    blk('blk_demo_bl_002', PG_SHOWCASE, 'bullet_list', { text: 'Second bullet point' }),
    blk('blk_demo_bl_003', PG_SHOWCASE, 'bullet_list', { text: 'Third with <strong>bold text</strong>' }),

    blk('blk_demo_nl_001', PG_SHOWCASE, 'numbered_list', { text: 'First numbered item' }),
    blk('blk_demo_nl_002', PG_SHOWCASE, 'numbered_list', { text: 'Second numbered item' }),
    blk('blk_demo_nl_003', PG_SHOWCASE, 'numbered_list', { text: 'Third numbered item' }),

    blk('blk_demo_cl_001', PG_SHOWCASE, 'checklist', { text: 'Completed task', checked: true }),
    blk('blk_demo_cl_002', PG_SHOWCASE, 'checklist', { text: 'Pending task', checked: false }),
    blk('blk_demo_cl_003', PG_SHOWCASE, 'checklist', { text: 'Another pending task', checked: false }),

    blk('blk_demo_h2_003', PG_SHOWCASE, 'heading2', { text: 'Code Block', level: 2 }),
    blk('blk_demo_cb_001', PG_SHOWCASE, 'code_block', {
      code: 'function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("World"));',
      language: 'typescript',
    }),

    blk('blk_demo_h2_004', PG_SHOWCASE, 'heading2', { text: 'Page Links', level: 2 }),
    blk('blk_demo_p3_001', PG_SHOWCASE, 'paragraph', { text: 'You can link to other pages in your workspace:' }),
    blk('blk_demo_pl_001', PG_SHOWCASE, 'page_link', { linkedPageId: PG_GETTING_STARTED }),
    blk('blk_demo_pl_002', PG_SHOWCASE, 'page_link', { linkedPageId: PG_BOOKS }),

    blk('blk_demo_dv_002', PG_SHOWCASE, 'divider', {}),
    blk('blk_demo_p4_001', PG_SHOWCASE, 'paragraph', { text: 'That\'s it! Try editing any of these blocks, or create new ones by pressing <code>/</code> in an empty block.' }),
  ];
}

function createGettingStartedBlocks(): Block[] {
  blockOrder = 0;
  return [
    blk('blk_demo_gs_001', PG_GETTING_STARTED, 'heading', { text: 'Getting Started with Nonotion', level: 1 }),
    blk('blk_demo_gs_002', PG_GETTING_STARTED, 'paragraph', { text: 'Nonotion is a <strong>Notion-like workspace</strong> where you can create pages, take notes, and organize information in databases.' }),
    blk('blk_demo_gs_003', PG_GETTING_STARTED, 'paragraph', { text: 'This is a <strong>demo version</strong> running entirely in your browser. All changes are saved to localStorage and will persist between page refreshes, but not across different browsers or devices.' }),
    blk('blk_demo_gs_004', PG_GETTING_STARTED, 'heading2', { text: 'What you can do', level: 2 }),
    blk('blk_demo_gs_005', PG_GETTING_STARTED, 'bullet_list', { text: 'Create and edit pages with rich text formatting' }),
    blk('blk_demo_gs_006', PG_GETTING_STARTED, 'bullet_list', { text: 'Build databases with filterable and sortable columns' }),
    blk('blk_demo_gs_007', PG_GETTING_STARTED, 'bullet_list', { text: 'Organize pages in a nested tree structure' }),
    blk('blk_demo_gs_008', PG_GETTING_STARTED, 'bullet_list', { text: 'Use slash commands (<code>/</code>) to insert different block types' }),
    blk('blk_demo_gs_009', PG_GETTING_STARTED, 'bullet_list', { text: 'Search across all your content with <code>Ctrl+K</code>' }),
    blk('blk_demo_gs_010', PG_GETTING_STARTED, 'bullet_list', { text: 'Drag and drop to reorder blocks' }),
    blk('blk_demo_gs_011', PG_GETTING_STARTED, 'paragraph', { text: 'Head back to the <a href="/page/' + PG_SHOWCASE + '">Formatting Showcase</a> to see all the available block types, or check out the <a href="/page/' + PG_BOOKS + '">Book Database</a> to explore database features.' }),
  ];
}

// ============ SEED ============

export function seedDemoData(): void {
  const pages = createPages();
  const blocks = [...createShowcaseBlocks(), ...createGettingStartedBlocks()];

  storage.saveAllPages(pages);
  storage.saveAllBlocks(blocks);
  storage.markDemoSeeded();
}
