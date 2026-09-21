"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/auth/form-field";
import { PhotoUploader } from "@/components/profile/photo-uploader";
import { getInitials } from "@/lib/format";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { profileFormSchema } from "@/lib/validators/profile";
import { fieldErrorsFromApi, fieldErrorsFromZod } from "@/lib/zod-errors";
import { createProfile, getMyProfile, updateProfile } from "@/lib/api/profile";
import { ApiClientError } from "@/lib/api-client";
import { GENDER_OPTIONS, RELATIONSHIP_GOAL_OPTIONS } from "@/types/api";

const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  "non-binary": "Non-binary",
  other: "Other",
};

const GOAL_LABELS: Record<string, string> = {
  casual: "Casual dating",
  serious: "Serious relationship",
  friendship: "Friendship",
  "not-sure": "Not sure yet",
};

export function OnboardingForm() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();

  const [mode, setMode] = useState<"create" | "edit">("create");
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [interestsInput, setInterestsInput] = useState("");
  const [relationshipGoal, setRelationshipGoal] = useState("");
  const [profileImage, setProfileImage] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;

    getMyProfile()
      .then(({ profile }) => {
        if (!active) return;
        setMode("edit");
        setAge(String(profile.age));
        setGender(profile.gender);
        setCity(profile.city);
        setBio(profile.bio ?? "");
        setInterestsInput(profile.interests.join(", "));
        setRelationshipGoal(profile.relationshipGoal);
        setProfileImage(profile.profileImage ?? "");
      })
      .catch(() => {
        if (active) setMode("create");
      })
      .finally(() => {
        if (active) setIsLoadingProfile(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const interests = interestsInput
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const result = profileFormSchema.safeParse({
      age,
      gender,
      city,
      bio,
      interests,
      relationshipGoal,
      profileImage,
    });

    if (!result.success) {
      setFieldErrors(fieldErrorsFromZod(result.error));
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);

    const payload = {
      ...result.data,
      profileImage: result.data.profileImage || undefined,
    };

    try {
      if (mode === "edit") {
        await updateProfile(payload);
      } else {
        await createProfile(payload);
      }
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
        if (err.status === 422) setFieldErrors(fieldErrorsFromApi(err.details));
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setIsSubmitting(false);
    }
  }

  if (isAuthLoading || isLoadingProfile) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-2xl px-4 py-28 sm:px-6">
      <div className="text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-brand shadow-lg shadow-primary/25">
          <Sparkles className="size-6 text-white" />
        </span>
        <h1 className="mt-5 font-display text-3xl font-semibold text-white sm:text-4xl">
          {mode === "edit" ? "Update your profile" : "Complete your profile"}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-white/55">
          {mode === "edit"
            ? "Keep your profile current so your matches stay accurate."
            : "A few honest details help SoulSync AI find people who actually fit."}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="glass-strong mt-10 space-y-6 rounded-3xl p-8 sm:p-10"
      >
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <FormField label="Age" htmlFor="age" error={fieldErrors.age}>
            <Input
              id="age"
              type="number"
              min={18}
              max={120}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="27"
            />
          </FormField>

          <FormField label="Gender" htmlFor="gender" error={fieldErrors.gender}>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger id="gender" className="w-full">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {GENDER_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <FormField label="City" htmlFor="city" error={fieldErrors.city}>
          <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" />
        </FormField>

        <FormField
          label="Relationship goal"
          htmlFor="relationshipGoal"
          error={fieldErrors.relationshipGoal}
        >
          <Select value={relationshipGoal} onValueChange={setRelationshipGoal}>
            <SelectTrigger id="relationshipGoal" className="w-full">
              <SelectValue placeholder="What are you looking for?" />
            </SelectTrigger>
            <SelectContent>
              {RELATIONSHIP_GOAL_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {GOAL_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label="Bio"
          htmlFor="bio"
          error={fieldErrors.bio}
          hint={!fieldErrors.bio ? `${bio.length}/500` : undefined}
        >
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell people what makes a great conversation with you..."
            rows={4}
            maxLength={500}
          />
        </FormField>

        <FormField
          label="Interests"
          htmlFor="interests"
          error={fieldErrors.interests}
          hint={!fieldErrors.interests ? "Separate with commas — e.g. hiking, jazz, cooking" : undefined}
        >
          <Input
            id="interests"
            value={interestsInput}
            onChange={(e) => setInterestsInput(e.target.value)}
            placeholder="hiking, jazz, cooking"
          />
        </FormField>

        <div className="space-y-2">
          <p className="text-sm font-medium text-white/85">Profile photo</p>
          <PhotoUploader
            value={profileImage}
            onChange={setProfileImage}
            initials={getInitials(user?.fullName ?? "")}
            linkField={
              <FormField
                label="Profile image URL"
                htmlFor="profileImage"
                error={fieldErrors.profileImage}
                hint={!fieldErrors.profileImage ? "Optional — paste a link to a photo" : undefined}
              >
                <Input
                  id="profileImage"
                  value={profileImage}
                  onChange={(e) => setProfileImage(e.target.value)}
                  placeholder="https://..."
                />
              </FormField>
            }
          />
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          size="lg"
          className="w-full gap-2 rounded-full bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          {isSubmitting ? "Saving..." : mode === "edit" ? "Save changes" : "Complete profile"}
        </Button>
      </form>
    </div>
  );
}
