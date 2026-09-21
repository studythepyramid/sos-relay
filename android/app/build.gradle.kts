plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.mediascripts.app"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.mediascripts.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material3.adaptive.navigation.suite)

    // On-device LLM (LiteRT-LM) — same engine proven working in basicsMar23
    implementation(libs.litertlm.android)

    // Camera
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}

// camera-view:1.5.0's POM floors androidx.appcompat at the very old 1.1.0,
// which (unlike newer appcompat releases already used elsewhere) isn't
// mirrored anywhere this build can reach. Nothing else in this graph pulls
// appcompat higher, so bump the floor explicitly.
configurations.all {
    resolutionStrategy {
        force("androidx.appcompat:appcompat:1.6.1")
        force("androidx.appcompat:appcompat-resources:1.6.1")
        force("androidx.compose.material:material:1.7.0")
        force("androidx.compose.material:material-android:1.7.0")
        force("androidx.compose.material:material-ripple:1.7.0")
        force("androidx.compose.material:material-ripple-android:1.7.0")
        force("androidx.compose.material:material-icons-core:1.7.0")
        force("androidx.compose.material:material-icons-core-android:1.7.0")
        force("androidx.compose.material3.adaptive:adaptive:1.1.0")
        force("androidx.compose.material3.adaptive:adaptive-android:1.1.0")
        force("androidx.compose.foundation:foundation:1.8.2")
        force("androidx.compose.foundation:foundation-android:1.8.2")
        force("androidx.compose.foundation:foundation-layout:1.8.2")
        force("androidx.compose.foundation:foundation-layout-android:1.8.2")
        force("androidx.compose.animation:animation:1.8.2")
        force("androidx.compose.animation:animation-android:1.8.2")
        force("androidx.compose.animation:animation-core:1.8.2")
        force("androidx.compose.animation:animation-core-android:1.8.2")

        val uiArtifacts = listOf(
            "ui", "ui-android", "ui-geometry", "ui-geometry-android",
            "ui-graphics", "ui-graphics-android", "ui-test", "ui-test-android",
            "ui-test-junit4", "ui-test-junit4-android", "ui-test-manifest",
            "ui-text", "ui-text-android", "ui-tooling", "ui-tooling-android",
            "ui-tooling-data", "ui-tooling-data-android", "ui-tooling-preview",
            "ui-tooling-preview-android", "ui-unit", "ui-unit-android",
            "ui-util", "ui-util-android"
        )
        uiArtifacts.forEach { force("androidx.compose.ui:$it:1.8.2") }

        val runtimeArtifacts = listOf(
            "runtime", "runtime-android", "runtime-annotation",
            "runtime-annotation-android", "runtime-saveable", "runtime-saveable-android"
        )
        runtimeArtifacts.forEach { force("androidx.compose.runtime:$it:1.9.0") }

        force("androidx.compose.material3:material3:1.3.0")
        force("androidx.compose.material3:material3-android:1.4.0")

        force("androidx.activity:activity:1.10.1")
        force("androidx.activity:activity-compose:1.10.1")
        force("androidx.activity:activity-ktx:1.10.1")
        force("androidx.drawerlayout:drawerlayout:1.1.1")

        val lifecycleArtifacts = listOf(
            "lifecycle-common", "lifecycle-common-java8", "lifecycle-common-jvm",
            "lifecycle-livedata", "lifecycle-livedata-core", "lifecycle-livedata-core-ktx",
            "lifecycle-process", "lifecycle-runtime", "lifecycle-runtime-android",
            "lifecycle-runtime-compose", "lifecycle-runtime-compose-android",
            "lifecycle-runtime-ktx", "lifecycle-runtime-ktx-android",
            "lifecycle-viewmodel", "lifecycle-viewmodel-android",
            "lifecycle-viewmodel-compose", "lifecycle-viewmodel-compose-android",
            "lifecycle-viewmodel-ktx", "lifecycle-viewmodel-savedstate",
            "lifecycle-viewmodel-savedstate-android"
        )
        lifecycleArtifacts.forEach { force("androidx.lifecycle:$it:2.9.0") }

        val savedstateArtifacts = listOf(
            "savedstate", "savedstate-android", "savedstate-ktx", "savedstate-compose-android"
        )
        savedstateArtifacts.forEach { force("androidx.savedstate:$it:1.3.0") }

        force("androidx.exifinterface:exifinterface:1.3.7")
    }
}
