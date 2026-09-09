import { supabase } from "../lib/supabase";

export async function getLocations() {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .order("name");

  if (error) throw error;

  return data;
}

export async function createLocation(name) {
  const { error } = await supabase
    .from("locations")
    .insert([
      {
        name,
        type: "Home",
      },
    ]);

  if (error) throw error;
}

export async function deleteLocation(id) {
  const { error } = await supabase
    .from("locations")
    .delete()
    .eq("id", id);

  if (error) throw error;
}