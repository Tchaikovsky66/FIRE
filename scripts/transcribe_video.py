"""Use the video-summarizer workflow with bounded chunk sizes for music beds."""

import importlib.util
import math
import sys

SKILL_SCRIPT = "/Users/shi/.codex/skills/video-summarizer/scripts/parallel_transcribe.py"
spec = importlib.util.spec_from_file_location("video_transcribe", SKILL_SCRIPT)
workflow = importlib.util.module_from_spec(spec)
sys.modules["video_transcribe"] = workflow
spec.loader.exec_module(workflow)


def bounded_splits(duration, silence_points, **kwargs):
    count = math.ceil(duration / 360)
    points = []
    for i in range(1, count):
        target = duration * i / count
        nearby = [point for point in silence_points if abs(point - target) < 12]
        points.append(min(nearby, key=lambda point: abs(point - target)) if nearby else target)
    return points


if __name__ == "__main__":
    workflow.find_split_points = bounded_splits
    workflow.check_dependencies()
    workflow.main()
