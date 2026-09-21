pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        // litertlm-android isn't fetchable through this machine's current
        // network path (confirmed: neither Gradle CLI nor Android Studio's
        // own sync could reach it). Reconstructed locally from the exact
        // bytes already legitimately cached on disk from basicsMar23's
        // prior real build (Gradle's own exploded-AAR transform cache) —
        // not a substitute version, the same artifact. Drop this once the
        // network path is fixed. Listed first: once google() resolves a
        // module's metadata it binds artifact download to that repo only,
        // so this has to win the metadata lookup for this one coordinate.
        maven {
            url = uri("local-repo")
            content { includeGroup("com.google.ai.edge.litertlm") }
        }
        google()
        mavenCentral()
    }
}

rootProject.name = "media-scripts-android"
include(":app")
