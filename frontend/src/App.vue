<script setup>
import { ref, onMounted } from "vue";

const apiBase = "http://localhost:3001"; // Change if backend runs elsewhere
const urlInput = ref("");
const jobs = ref([]);
const loading = ref(false);
const error = ref("");
const submitting = ref(false);
const notification = ref({ message: "", type: "" });
let notificationTimeout = null;

async function fetchJobs() {
  loading.value = true;
  try {
    const res = await fetch(`${apiBase}/status`);
    jobs.value = await res.json();
  } catch (e) {
    error.value = "Failed to fetch jobs";
  } finally {
    loading.value = false;
  }
}

function showNotification(message, type = "success") {
  notification.value = { message, type };
  if (notificationTimeout) clearTimeout(notificationTimeout);
  notificationTimeout = setTimeout(() => {
    notification.value = { message: "", type: "" };
  }, 3000);
}

async function submitUrl() {
  if (!urlInput.value) return;
  submitting.value = true;
  error.value = "";
  try {
    const res = await fetch(`${apiBase}/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: urlInput.value }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to submit");
    }
    urlInput.value = "";
    await fetchJobs();
    showNotification("URL submitted successfully!", "success");
  } catch (e) {
    error.value = e.message;
    showNotification(e.message, "error");
  } finally {
    submitting.value = false;
  }
}

onMounted(fetchJobs);
</script>

<template>
  <main style="max-width: 600px; margin: 2rem auto; font-family: sans-serif">
    <h1>Web Crawler</h1>
    <div
      v-if="notification.message"
      :class="['notification', notification.type]"
    >
      {{ notification.message }}
    </div>
    <form @submit.prevent="submitUrl" style="margin-bottom: 2rem">
      <input
        v-model="urlInput"
        type="url"
        placeholder="Enter website URL"
        style="width: 70%; padding: 0.5em"
        required
      />
      <button
        :disabled="submitting"
        style="padding: 0.5em 1em; margin-left: 1em"
      >
        {{ submitting ? "Submitting..." : "Submit" }}
      </button>
    </form>
    <div v-if="error" style="color: red; margin-bottom: 1em">{{ error }}</div>
    <section>
      <h2>Crawl Jobs</h2>
      <button @click="fetchJobs" :disabled="loading" style="margin-bottom: 1em">
        Refresh
      </button>
      <div v-if="loading">Loading...</div>
      <table
        v-if="jobs.length"
        border="1"
        cellpadding="8"
        style="width: 100%; border-collapse: collapse"
      >
        <thead>
          <tr>
            <th>URL</th>
            <th>Status</th>
            <th>Created</th>
            <th>Download</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="job in jobs" :key="job._id">
            <td style="word-break: break-all">{{ job.url }}</td>
            <td>{{ job.status }}</td>
            <td>{{ new Date(job.createdAt).toLocaleString() }}</td>
            <td>
              <a
                v-if="job.status === 'done' && job.resultZipPath"
                :href="`${apiBase}/download/${job._id}`"
                target="_blank"
                >Download</a
              >
              <span v-else>-</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else>No jobs yet.</div>
    </section>
  </main>
</template>

<style scoped>
input[type="url"] {
  border: 1px solid #ccc;
  border-radius: 4px;
}
button {
  background: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
button:disabled {
  background: #aaa;
  cursor: not-allowed;
}
table th {
  background: #f4f4f4;
}
.notification {
  padding: 1em;
  margin-bottom: 1em;
  border-radius: 4px;
  font-weight: bold;
  text-align: center;
  transition: opacity 0.3s;
}
.notification.success {
  background: #e6ffed;
  color: #256029;
  border: 1px solid #42b883;
}
.notification.error {
  background: #ffeaea;
  color: #a94442;
  border: 1px solid #e74c3c;
}
</style>
