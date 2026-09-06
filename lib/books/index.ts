'use client';

import { isLocalMode } from '@/lib/supabase/env';
import { localStore } from './local';
import { supabaseStore } from './supabase';
import type { BookStore } from './types';

/** The active book store: localStorage in local mode, Supabase otherwise. Same API either way. */
const store: BookStore = isLocalMode() ? localStore : supabaseStore;

export const createBook = store.createBook;
export const loadBook = store.loadBook;
export const loadProgress = store.loadProgress;
export const saveProgress = store.saveProgress;
