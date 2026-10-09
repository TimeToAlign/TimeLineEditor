import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");
if (target === null) {
  throw new Error('index.html has no element with id "app"');
}

mount(App, { target });
