'use client';

import { isLocalMode } from '@/lib/supabase/env';
import { localStore } from './local';
import { supabaseStore } from './supabase';
import type { BookStore } from './types';

/** The active book store: localStorage in local mode, Supabase otherwise. Same API either way. */
const store: BookStore = isLocalMode() ? localStore : supabaseStore;

export const createBook = store.createBook;
export const loadBook = store.loadBook;
export const listBooks = store.listBooks;
export const updateBook = store.updateBook;
export const deleteBook = store.deleteBook;
export const loadProgress = store.loadProgress;
export const saveProgress = store.saveProgress;
export const touchHistory = store.touchHistory;
export const listHistory = store.listHistory;
export const listBookmarks = store.listBookmarks;
export const addBookmark = store.addBookmark;
export const removeBookmark = store.removeBookmark;
/** Fired by the local store on any change; Supabase mode never fires it (pages re-fetch on navigation). */
export { LOCAL_BOOKS_EVENT } from './local';
