# Sensor Experiments

Browser lab for motion-game sensor feasibility — swing peak detection with DeviceMotion.

## Live site

After the first successful Pages deploy:

**https://tslackey.github.io/sensor-experiments/**

## Swing Lab

Open [`site/index.html`](site/index.html) (or the Pages URL) to:

1. Enable DeviceMotion (iOS prompts for permission on tap)
2. Watch live accel magnitude / axes
3. Tune peak threshold, reset floor, duration, and cooldown
4. Log detected swings with dominant axis + direction
5. Run **simulated swings** on desktop when no IMU is available

## Local preview

Any static server from the `site` folder works, e.g.:

```bash
python3 -m http.server 4173 --directory site
```

Then open `http://localhost:4173`. Sensors need a secure context on many browsers; localhost counts.

## GitHub Pages

Workflow: [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)

- Triggers on push to `main` and `workflow_dispatch`
- Uploads the `site/` directory as a Pages artifact
- Deploys with `actions/deploy-pages`

One-time repo setting: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## License

Unlicense — see [LICENSE](LICENSE).
