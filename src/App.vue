<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>

<style>
/* Global reset if needed, but Tailwind handles most */
html, body {
  height: 100%;
  margin: 0;
  background-color: #f9fafb; /* Gray-50 */
}
</style>
