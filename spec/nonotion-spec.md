# **Engineering Specification: Nonotion Workspace Platform**

## **1\. Application Overview**

"Nonotion" is a self-hosted, lightweight alternative to the "all-in-one" workspace paradigm. It distills the core structural and relational features of block-based productivity tools into a portable, single-tenant or small-team environment.

### **1.1 Inspiration and Philosophy**

The application is directly inspired by Notion's "Lego-brick" approach to content, where information is treated as a recursive tree of blocks rather than a flat document.1 It is designed as a strategic response to the bloat of modern SaaS tools, prioritizing:

* **Data Sovereignty**: Local-first storage options ensure the user retains absolute control over their intellectual property.3  
* **Deployment Simplicity**: A "one-command" Dockerized setup with no external dependencies (Redis, Message Queues) required for the MVP.  
* **Interoperability**: Strict adherence to a portable JSON-based data model to prevent vendor lock-in.5

### **1.2 Personas**

* **The "Privacy-First Professional" (User)**: Individual users who require the organization of a relational database but refuse to host sensitive data on third-party cloud infrastructure.7  
* **The "Technical Self-Hoster" (User)**: Hobbyists or sysadmins running home labs (e.g., Raspberry Pi, VPS) who value minimal resource footprints and standard Docker deployment.8  
* **The "Small Team Coordinator" (User)**: Teams of 2–10 members requiring a shared wiki and basic project tracking with simple Google OAuth onboarding.9  
* **The "Open Source Steward" (Maintainer)**: Developers focusing on the stability of the core "thin" runtime and ensuring the public Git repository remains accessible for community audits.  
* **The "Plugin Contributor" (Maintainer)**: Third-party developers who extend the workspace by building isolated block components (e.g., video players, charts) using the registration API.

## **2\. Interface and User Interactions**

### **2.1 Basic Interfaces**

* **Workspace Sidebar**: A recursive tree-view of all pages. Features a "Starred" section for pinned shortcuts and toggle-able sub-page hierarchies.  
* **Block Canvas**: The primary editor where users interact with discrete units of content. It features a "drag-and-drop" margin for rearranging blocks and a floating formatting toolbar.  
* **Database View**: A specialized view that treats child pages as relational entries, displaying them in a table format with sortable and filterable properties.

### **2.2 Core Interactions**

* **Slash Commands (/)**: Typing / triggers a searchable menu to insert new block types (Heading, Image, Code Block, etc.).  
* **Block Reorganization**: Hovering over a block reveals a "six-dot" handle for moving elements vertically or nesting them within other blocks (e.g., bullets within a toggle).  
* **In-line Mentions (@)**: Using the @ symbol triggers a type-ahead menu to link to other pages or tag workspace members, creating bidirectional references.

## **3\. Core System Architecture: Plugin-Based Block Model**

All content types must be implemented as independent modules to ensure strict architectural boundaries.

### **3.1 Block Plugin API**

* **Registration**: All plugins must register via a registerBlockType call, providing a unique ID, icon, and config schema.  
* **Interfaces**: Every plugin must implement:  
  * **Edit**: React component for the user editing experience.  
  * **Save**: Logic to serialize state into a specific JSON schema.  
  * **Render**: Read-only view for published or shared states.  
* **Encapsulation**: CSS, state logic, and external assets (video players, image renderers) must be scoped within the plugin to prevent side effects on the core runtime.

## **4\. User Management & Authentication**

### **4.1 Identity Providers**

* **Local Store**: Email/password authentication using a local user index.  
* **OAuth**: Support for Google login via standard environment variable configuration.

### **4.2 Permissions**

* **Levels**: View, Edit, and Full Access.  
* **Inheritance**: Permissions cascade hierarchically (Parent → Child) by default. The system must support "breaking inheritance" to set unique permissions for a specific sub-tree.

## **5\. Storage & Data Portability**

### **5.1 Storage Backends**

* **Local JSON**: Content is saved as human-readable JSON files in a mapped Docker volume.11  
* **Supabase**: Relational storage using PostgreSQL and Supabase Storage for media binary assets.

### **5.2 Portability**

* **Import**: Parser for Notion JSON exports, mapping them to the nonotion internal block schema.7  
* **Export**: Utility for Supabase users to download a ZIP of the workspace in the standard Local JSON format for backup or migration.

## **6\. Database Functionality (Sub-Page Collections)**

A Database is a parent page that renders its children as records with metadata properties.

### **6.1 MVP Property Types**

* **Page Name**: Title (mandatory).  
* **Categorization**: Select, Multi-select tags.  
* **Temporal**: Date (ISO 8601).  
* **Relational**: Person (User ID), URL, Checkbox.

### **6.2 Logic**

* **Views**: Table (Primary) and Page (opening any entry as a full canvas).  
* **Operations**: Sort by Date/Title; Filter by Select/Checkbox properties.

## **7\. Collaborative Logic & Deployment**

* **Sync**: "Last-Write-Wins" (LWW) conflict resolution at the block level.14  
* **Presence**: Real-time avatars in the header showing users currently viewing the page.  
* **Deployment**: Single Docker image; managed via a public Git repository; configured via environment variables.

#### **Works cited**

1. Create Your Own Notion App Clone: Complete Guide \- DhiWise, accessed January 28, 2026, [https://www.dhiwise.com/post/build-your-own-notion-app-clone-guide](https://www.dhiwise.com/post/build-your-own-notion-app-clone-guide)  
2. I found an open-source app like Notion, except it's better \- XDA Developers, accessed January 28, 2026, [https://www.xda-developers.com/open-source-app-like-notion-but-better/](https://www.xda-developers.com/open-source-app-like-notion-but-better/)  
3. AppFlowy vs. Logseq Comparison \- SourceForge, accessed January 28, 2026, [https://sourceforge.net/software/compare/AppFlowy-vs-Logseq/](https://sourceforge.net/software/compare/AppFlowy-vs-Logseq/)  
4. Forget Notion: These open-source alternatives are way better \- XDA Developers, accessed January 28, 2026, [https://www.xda-developers.com/forget-notion-open-source-alternatives-are-better/](https://www.xda-developers.com/forget-notion-open-source-alternatives-are-better/)  
5. Creating the Notion API, accessed January 28, 2026, [https://www.notion.com/blog/creating-the-notion-api](https://www.notion.com/blog/creating-the-notion-api)  
6. JSON-DOC is a block based document file format and data model based on Notion (work in progress) \- GitHub, accessed January 28, 2026, [https://github.com/textcortex/JSON-DOC](https://github.com/textcortex/JSON-DOC)  
7. 5 great open-source alternatives to Notion for 2025 \- XWiki, accessed January 28, 2026, [https://xwiki.com/en/Blog/5-alternatives-to-Notion/](https://xwiki.com/en/Blog/5-alternatives-to-Notion/)  
8. Ultimate Self-Hosted Focalboard Ubuntu 24.04 Setup Guide \- Quape, accessed January 28, 2026, [https://www.quape.com/self-hosted-focalboard-ubuntu-24-04-2/](https://www.quape.com/self-hosted-focalboard-ubuntu-24-04-2/)  
9. Wiki.js, accessed January 28, 2026, [https://js.wiki/](https://js.wiki/)  
10. Focalboard Review: A Powerful Open Source Alternative To Trello, Asana, And Notion?, accessed January 28, 2026, [https://www.designwhine.com/focalboard-review-alternative-to-trello-asana/](https://www.designwhine.com/focalboard-review-alternative-to-trello-asana/)  
11. Storing, Accessing, and displaying JSON data in local storage | Penetration Testing, accessed January 28, 2026, [https://fdzdev.medium.com/storing-accessing-and-displaying-json-data-in-local-storage-pe-d4ef8e509e31](https://fdzdev.medium.com/storing-accessing-and-displaying-json-data-in-local-storage-pe-d4ef8e509e31)  
12. Rich text box with mentions and hashtags \- Algolia, accessed January 28, 2026, [https://algolia.com/doc/ui-libraries/autocomplete/solutions/rich-text-box-with-mentions-and-hashtags](https://algolia.com/doc/ui-libraries/autocomplete/solutions/rich-text-box-with-mentions-and-hashtags)  
13. Which rich text editor framework should you choose in 2025? | Liveblocks blog, accessed January 28, 2026, [https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025)  
14. Offline-First Apps Made Simple: Supabase \+ PowerSync, accessed January 28, 2026, [https://www.powersync.com/blog/offline-first-apps-made-simple-supabase-powersync](https://www.powersync.com/blog/offline-first-apps-made-simple-supabase-powersync)  
15. You don't need a CRDT to build a collaborative experience \- Hacker News, accessed January 28, 2026, [https://news.ycombinator.com/item?id=38289327](https://news.ycombinator.com/item?id=38289327)